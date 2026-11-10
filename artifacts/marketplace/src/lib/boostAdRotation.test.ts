import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOOST_AD_COOLDOWN_KEY,
  BOOST_AD_GUEST_ID_KEY,
  BOOST_AD_INTERVAL_MS,
  BOOST_AD_LEGACY_DEVICE_ID_KEY,
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

    // After a seller promo plays, the next pick must be a different role's creative.
    expect(pickNextBoostRotationId(eligible, [seller])).not.toBe(seller);
    expect([admin, superAdmin]).toContain(
      pickNextBoostRotationId(eligible, [seller])!,
    );

    // Force-close / reopen with cached history still prefers unseen.
    expect(pickNextBoostRotationId(eligible, [admin, seller])).toBe(superAdmin);

    // Once all three were shown, least-recently-shown wins (seller oldest here).
    expect(
      pickNextBoostRotationId(eligible, [superAdmin, admin, seller]),
    ).toBe(seller);
  });

  it("after every eligible video was shown, rotates to the least recently shown", () => {
    // History most-recent-first: 30 just played, then 20, then 10 (oldest).
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
  it("scopes history to the signed-in account and records only on playback", () => {
    stubStorage();
    const scope = getBoostViewerScopeKey(7);
    expect(scope).toBe("user_7");
    expect(getBoostExcludeIds(scope)).toEqual([]);

    recordBoostPlaybackExposure(scope, 101, 1_000);
    recordBoostPlaybackExposure(scope, 202, 2_000);
    expect(getBoostExcludeIds(scope)).toEqual([202, 101]);
    expect(JSON.parse(memory.get(boostRotationStorageKey(scope))!)).toEqual([
      { id: 202, at: 2_000 },
      { id: 101, at: 1_000 },
    ]);

    // Different account keeps a separate rotation history.
    const other = getBoostViewerScopeKey(8);
    expect(getBoostExcludeIds(other)).toEqual([]);
  });

  it("reuses a stable guest identity (including legacy device id)", () => {
    stubStorage();
    memory.set(BOOST_AD_LEGACY_DEVICE_ID_KEY, "legacy-device");
    expect(getOrCreateBoostGuestId()).toBe("legacy-device");
    expect(getBoostViewerScopeKey(null)).toBe("guest_legacy-device");
    expect(memory.get(BOOST_AD_GUEST_ID_KEY)).toBe("legacy-device");
  });

  it("keeps frequency cooldown separate from billable impressions", () => {
    stubStorage();
    expect(shouldShowBoostAd(10_000)).toBe(true);
    markBoostAdShown(10_000);
    expect(shouldShowBoostAd(10_000 + BOOST_AD_INTERVAL_MS - 1)).toBe(false);
    expect(shouldShowBoostAd(10_000 + BOOST_AD_INTERVAL_MS)).toBe(true);
    clearBoostAdCooldown();
    expect(memory.has(BOOST_AD_COOLDOWN_KEY)).toBe(false);
    expect(shouldShowBoostAd(10_000)).toBe(true);
  });
});
