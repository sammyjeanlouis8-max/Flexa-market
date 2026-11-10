import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOOST_AD_COOLDOWN_KEY,
  BOOST_AD_GUEST_ID_KEY,
  BOOST_AD_INTERVAL_MS,
  BOOST_AD_LEGACY_DEVICE_ID_KEY,
  boostCooldownStorageKey,
  boostRotationStorageKey,
  clearBoostAdCooldown,
  getBoostExcludeIds,
  getBoostViewerScopeKey,
  getOrCreateBoostGuestId,
  markBoostAdShown,
  parseBoostRotationHistory,
  pickNextBoostRotationId,
  recordBoostPlaybackExposure,
  shouldShowBoostAd,
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

  it("returns the sole eligible video (repeat left to frequency cooldown)", () => {
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

describe("scoped persistence + cooldown", () => {
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

  it("keeps frequency cooldown per market, separate from billable impressions", () => {
    stubStorage();
    const haiti = getBoostViewerScopeKey(1, "Haiti");
    const dr = getBoostViewerScopeKey(1, "Dominican Republic");
    expect(shouldShowBoostAd(haiti, 10_000)).toBe(true);
    markBoostAdShown(haiti, 10_000);
    expect(shouldShowBoostAd(haiti, 10_000 + BOOST_AD_INTERVAL_MS - 1)).toBe(false);
    // Other country is unaffected — country switch can deliver immediately.
    expect(shouldShowBoostAd(dr, 10_000)).toBe(true);
    expect(shouldShowBoostAd(haiti, 10_000 + BOOST_AD_INTERVAL_MS)).toBe(true);
    clearBoostAdCooldown(haiti);
    expect(memory.has(boostCooldownStorageKey(haiti))).toBe(false);
    expect(memory.has(BOOST_AD_COOLDOWN_KEY)).toBe(false);
    expect(shouldShowBoostAd(haiti, 10_000)).toBe(true);
  });
});
