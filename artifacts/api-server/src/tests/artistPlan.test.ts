import { describe, expect, it } from "vitest";
import {
  ARTIST_PLAN_PRICE_CENTS,
  ARTIST_PLAN_PRICE_USD,
  allocateArtistPlanWallet,
  getArtistPlanState,
  getNextArtistPlanExpiry,
} from "../lib/artistPlan";
import { consumeUploadProxyToken, issueUploadProxyToken } from "../lib/uploadProxyTokens";

const NOW = new Date("2026-08-19T12:00:00.000Z");

describe("Artist Plan upload eligibility", () => {
  it.each([0, 1])("allows a free artist with %i uploaded tracks", (songCount) => {
    const state = getArtistPlanState({
      subscriptionPlan: "basic",
      subscriptionExpiresAt: null,
      songCount,
      now: NOW,
    });
    expect(state.canUpload).toBe(true);
    expect(state.isArtistPlan).toBe(false);
    expect(state.freeSongLimit).toBe(2);
  });

  it("requires the plan at the free two-track allowance", () => {
    const state = getArtistPlanState({
      subscriptionPlan: "basic",
      subscriptionExpiresAt: null,
      songCount: 2,
      now: NOW,
    });
    expect(state.canUpload).toBe(false);
  });

  it("allows uploads above the free allowance for an active Artist Plan", () => {
    const state = getArtistPlanState({
      subscriptionPlan: "artist",
      subscriptionExpiresAt: "2027-08-19T12:00:00.000Z",
      songCount: 25,
      now: NOW,
    });
    expect(state.isArtistPlan).toBe(true);
    expect(state.canUpload).toBe(true);
  });

  it("treats an expired Artist Plan as inactive", () => {
    const state = getArtistPlanState({
      subscriptionPlan: "artist",
      subscriptionExpiresAt: "2026-08-18T12:00:00.000Z",
      songCount: 2,
      now: NOW,
    });
    expect(state.isArtistPlan).toBe(false);
    expect(state.canUpload).toBe(false);
  });
});

describe("Artist Plan pricing and FM Wallet allocation", () => {
  it("keeps the server price fixed at $50 / 5000 cents", () => {
    expect(ARTIST_PLAN_PRICE_USD).toBe(50);
    expect(ARTIST_PLAN_PRICE_CENTS).toBe(5000);
  });

  it("does not allocate any deduction when combined funds are insufficient", () => {
    const allocation = allocateArtistPlanWallet({
      promoBalance: 10,
      balanceUsd: 30,
      firstRechargeDone: false,
    });
    expect(allocation).toEqual({
      ok: false,
      promoAvailable: 10,
      realAvailable: 30,
    });
  });

  it("uses promo first and real funds for the remainder", () => {
    const allocation = allocateArtistPlanWallet({
      promoBalance: 20,
      balanceUsd: 100,
      firstRechargeDone: false,
    });
    expect(allocation).toMatchObject({ ok: true, promoUsed: 20, realUsed: 30 });
  });

  it("preserves the post-recharge minimum balance", () => {
    const insufficient = allocateArtistPlanWallet({
      promoBalance: 0,
      balanceUsd: 50,
      firstRechargeDone: true,
    });
    expect(insufficient).toMatchObject({ ok: false, realAvailable: 48.5 });

    const sufficient = allocateArtistPlanWallet({
      promoBalance: 1.5,
      balanceUsd: 50,
      firstRechargeDone: true,
    });
    expect(sufficient).toMatchObject({ ok: true, promoUsed: 1.5, realUsed: 48.5 });
  });
});

describe("Artist Plan renewals", () => {
  it("starts a first paid year from now", () => {
    expect(getNextArtistPlanExpiry({
      subscriptionPlan: "basic",
      subscriptionExpiresAt: null,
      now: NOW,
    })?.toISOString()).toBe("2027-08-19T12:00:00.000Z");
  });

  it("extends a distinct paid year from the current active expiry", () => {
    expect(getNextArtistPlanExpiry({
      subscriptionPlan: "artist",
      subscriptionExpiresAt: "2027-08-19T12:00:00.000Z",
      now: NOW,
    })?.toISOString()).toBe("2028-08-18T12:00:00.000Z");
  });
});

describe("Music upload proxy tokens", () => {
  it("preserves owner/file constraints and can be consumed only once", () => {
    const issued = issueUploadProxyToken({
      contentType: "audio/mpeg",
      expectedBytes: 12345,
      maxBytes: 1500 * 1024 * 1024,
      purpose: "music",
      ownerId: 42,
      musicKind: "audio",
    });

    expect(consumeUploadProxyToken(issued.token)).toMatchObject({
      contentType: "audio/mpeg",
      expectedBytes: 12345,
      purpose: "music",
      ownerId: 42,
      musicKind: "audio",
    });
    expect(consumeUploadProxyToken(issued.token)).toBeNull();
  });
});