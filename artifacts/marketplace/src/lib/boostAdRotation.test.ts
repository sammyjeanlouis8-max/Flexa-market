import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOOST_AD_FIRST_DELAY_MS,
  BOOST_AD_GUEST_ID_KEY,
  BOOST_AD_INTERVAL_MS,
  BOOST_AD_LEGACY_DEVICE_ID_KEY,
  BOOST_AD_ROLLING_CAP,
  BOOST_AD_ROLLING_WINDOW_MS,
  boostRotationStorageKey,
  canDeliverBoostAd,
  countRecentBoostDeliveries,
  getBoostExcludeIds,
  getBoostBrowseSession,
  getBoostViewerScopeKey,
  getBoostViewerTimingKey,
  getOrCreateBoostGuestId,
  markBoostAdPlacementConsumed,
  parseBoostRotationHistory,
  pickNextBoostRotationId,
  recordBoostPlaybackExposure,
  requiredBrowsingMsForNextAd,
  tickBoostBrowsing,
  writeBoostBrowseSession,
} from "./boostAdRotation";

const memory = new Map<string, string>();

afterEach(() => {
  memory.clear();
  vi.unstubAllGlobals();
});

function stubStorage() {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memory.set(k, String(v));
    },
    removeItem: (k: string) => {
      memory.delete(k);
    },
  });
}

/** Simulate continuous active browsing from `fromMs` through `toMs` in 1s ticks. */
function advanceActiveBrowsing(timingKey: string, fromMs: number, toMs: number) {
  tickBoostBrowsing(timingKey, fromMs, true);
  for (let t = fromMs + 1_000; t <= toMs; t += 1_000) {
    tickBoostBrowsing(timingKey, t, true);
  }
}

describe("pickNextBoostRotationId", () => {
  it("prefers a never-seen eligible video over the last shown one", () => {
    expect(pickNextBoostRotationId([10, 20, 30], [10])).toBe(20);
    expect(pickNextBoostRotationId([10, 20], [10])).toBe(20);
  });

  it("rotates Seller / Admin / Super Admin creatives in one pool (no role filter)", () => {
    const seller = 101;
    const admin = 202;
    const superAdmin = 303;
    const eligible = [seller, admin, superAdmin];

    expect(pickNextBoostRotationId(eligible, [seller])).not.toBe(seller);
    expect([admin, superAdmin]).toContain(
      pickNextBoostRotationId(eligible, [seller])!,
    );
    expect(pickNextBoostRotationId(eligible, [admin, seller])).toBe(superAdmin);
    expect(
      pickNextBoostRotationId(eligible, [superAdmin, admin, seller]),
    ).toBe(seller);
  });

  it("after every eligible video was shown, rotates to the least recently shown", () => {
    expect(pickNextBoostRotationId([10, 20, 30], [30, 20, 10])).toBe(10);
  });

  it("returns the sole eligible video (repeat left to frequency limits)", () => {
    expect(pickNextBoostRotationId([42], [42, 99])).toBe(42);
  });

  it("returns null when nothing is eligible (skip placement)", () => {
    expect(pickNextBoostRotationId([], [1, 2])).toBeNull();
  });
});

describe("parseBoostRotationHistory", () => {
  it("dedupes, sorts most-recent-first, and drops invalid rows", () => {
    const parsed = parseBoostRotationHistory(
      JSON.stringify([
        { id: 2, at: 100 },
        { id: "nope", at: 200 },
        { id: 1, at: 300 },
        { id: 2, at: 50 },
        { id: -1, at: 400 },
      ]),
    );
    expect(parsed).toEqual([
      { id: 1, at: 300 },
      { id: 2, at: 100 },
    ]);
  });
});

describe("scoped persistence + country switch", () => {
  it("scopes history to the signed-in account AND browsing country", () => {
    stubStorage();
    const haiti = getBoostViewerScopeKey(7, "Haiti");
    const dr = getBoostViewerScopeKey(7, "Dominican Republic");
    expect(haiti).toBe("user_7|haiti");
    expect(dr).toBe("user_7|dominican republic");

    recordBoostPlaybackExposure(haiti, 101, 1_000);
    expect(getBoostExcludeIds(haiti)).toEqual([101]);
    // Dominican Republic must not reuse Haiti playback history.
    expect(getBoostExcludeIds(dr)).toEqual([]);

    recordBoostPlaybackExposure(dr, 202, 2_000);
    expect(getBoostExcludeIds(dr)).toEqual([202]);
    expect(getBoostExcludeIds(haiti)).toEqual([101]);
    expect(JSON.parse(memory.get(boostRotationStorageKey(haiti))!)).toEqual([
      { id: 101, at: 1_000 },
    ]);
  });

  it("reuses a stable guest identity (including legacy device id)", () => {
    stubStorage();
    memory.set(BOOST_AD_LEGACY_DEVICE_ID_KEY, "legacy-device");
    expect(getOrCreateBoostGuestId()).toBe("legacy-device");
    expect(getBoostViewerScopeKey(null, "Haiti")).toBe("guest_legacy-device|haiti");
    expect(memory.get(BOOST_AD_GUEST_ID_KEY)).toBe("legacy-device");
  });

  it("keeps browsing time + rolling cap across country changes", () => {
    stubStorage();
    const timing = getBoostViewerTimingKey(9);
    writeBoostBrowseSession(timing, {
      accumulatedActiveMs: BOOST_AD_FIRST_DELAY_MS,
      lastActiveTickAt: null,
      deliveryAts: [],
      hasDelivered: false,
    });
    expect(canDeliverBoostAd(timing, 10_000)).toBe(true);
    markBoostAdPlacementConsumed(timing, 10_000);
    // Country switch must not wipe the interval / cap.
    expect(canDeliverBoostAd(timing, 10_000 + 1_000)).toBe(false);
    const after = getBoostBrowseSession(timing);
    expect(after.hasDelivered).toBe(true);
    expect(after.accumulatedActiveMs).toBe(0);
    expect(after.deliveryAts).toEqual([10_000]);
  });
});

describe("active browsing timer (30s / 15min / 3-per-60min)", () => {
  it("allows the first automatic promotion after 30s of active browsing", () => {
    stubStorage();
    const timing = getBoostViewerTimingKey(1);
    expect(requiredBrowsingMsForNextAd(getBoostBrowseSession(timing))).toBe(
      BOOST_AD_FIRST_DELAY_MS,
    );
    expect(canDeliverBoostAd(timing, 0)).toBe(false);

    advanceActiveBrowsing(timing, 0, BOOST_AD_FIRST_DELAY_MS - 1_000);
    expect(canDeliverBoostAd(timing, BOOST_AD_FIRST_DELAY_MS - 1_000)).toBe(false);

    advanceActiveBrowsing(
      timing,
      BOOST_AD_FIRST_DELAY_MS - 1_000,
      BOOST_AD_FIRST_DELAY_MS,
    );
    expect(canDeliverBoostAd(timing, BOOST_AD_FIRST_DELAY_MS)).toBe(true);
  });

  it("requires 15 more minutes of active browsing after a placement", () => {
    stubStorage();
    const timing = getBoostViewerTimingKey(2);
    markBoostAdPlacementConsumed(timing, 1_000);
    expect(requiredBrowsingMsForNextAd(getBoostBrowseSession(timing))).toBe(
      BOOST_AD_INTERVAL_MS,
    );
    expect(canDeliverBoostAd(timing, 1_000)).toBe(false);

    const start = 2_000;
    advanceActiveBrowsing(timing, start, start + BOOST_AD_INTERVAL_MS - 1_000);
    expect(
      canDeliverBoostAd(timing, start + BOOST_AD_INTERVAL_MS - 1_000),
    ).toBe(false);

    advanceActiveBrowsing(
      timing,
      start + BOOST_AD_INTERVAL_MS - 1_000,
      start + BOOST_AD_INTERVAL_MS,
    );
    expect(canDeliverBoostAd(timing, start + BOOST_AD_INTERVAL_MS)).toBe(true);
  });

  it("pauses accumulation while inactive (background / idle / ad)", () => {
    stubStorage();
    const timing = getBoostViewerTimingKey(3);
    advanceActiveBrowsing(timing, 0, 10_000);
    expect(getBoostBrowseSession(timing).accumulatedActiveMs).toBe(10_000);

    // Pause — large wall-clock gap must not count.
    tickBoostBrowsing(timing, 10_000, false);
    tickBoostBrowsing(timing, 10_000 + 5 * 60_000, true);
    // Only the first tick after resume starts the clock; no huge delta credited.
    expect(getBoostBrowseSession(timing).accumulatedActiveMs).toBe(10_000);
    advanceActiveBrowsing(timing, 10_000 + 5 * 60_000, 10_000 + 5 * 60_000 + 5_000);
    expect(getBoostBrowseSession(timing).accumulatedActiveMs).toBe(15_000);
  });

  it("persists accumulated browsing time across restarts", () => {
    stubStorage();
    const timing = getBoostViewerTimingKey(4);
    writeBoostBrowseSession(timing, {
      accumulatedActiveMs: 25_000,
      lastActiveTickAt: null,
      deliveryAts: [],
      hasDelivered: false,
    });
    // Simulate app restart — lastActiveTickAt cleared, accumulator kept.
    const restored = getBoostBrowseSession(timing);
    expect(restored.accumulatedActiveMs).toBe(25_000);
    advanceActiveBrowsing(timing, 100, 100 + 5_000);
    expect(canDeliverBoostAd(timing, 100 + 5_000)).toBe(true);
  });

  it("caps automatic promotions at 3 per rolling 60-minute window across countries", () => {
    stubStorage();
    const timing = getBoostViewerTimingKey(5);
    const t0 = 1_000_000;
    markBoostAdPlacementConsumed(timing, t0);
    markBoostAdPlacementConsumed(timing, t0 + 60_000);
    markBoostAdPlacementConsumed(timing, t0 + 120_000);
    expect(countRecentBoostDeliveries(getBoostBrowseSession(timing), t0 + 120_000)).toBe(
      BOOST_AD_ROLLING_CAP,
    );

    // Even with enough browsing time, the rolling cap blocks delivery.
    writeBoostBrowseSession(timing, {
      ...getBoostBrowseSession(timing),
      accumulatedActiveMs: BOOST_AD_INTERVAL_MS,
      lastActiveTickAt: null,
    });
    expect(canDeliverBoostAd(timing, t0 + 120_000)).toBe(false);

    // After the oldest drops out of the 60-minute window, delivery is allowed again.
    const afterWindow = t0 + BOOST_AD_ROLLING_WINDOW_MS + 1;
    writeBoostBrowseSession(timing, {
      ...getBoostBrowseSession(timing),
      accumulatedActiveMs: BOOST_AD_INTERVAL_MS,
      lastActiveTickAt: null,
    });
    expect(canDeliverBoostAd(timing, afterWindow)).toBe(true);
  });

  it("dedupes exposure + dismiss so one placement counts once toward the cap", () => {
    stubStorage();
    const timing = getBoostViewerTimingKey(6);
    const scope = getBoostViewerScopeKey(6, "Haiti");
    recordBoostPlaybackExposure(scope, 55, 5_000);
    markBoostAdPlacementConsumed(timing, 5_500);
    expect(getBoostBrowseSession(timing).deliveryAts).toEqual([5_000]);
    expect(getBoostExcludeIds(scope)).toEqual([55]);
  });
});
