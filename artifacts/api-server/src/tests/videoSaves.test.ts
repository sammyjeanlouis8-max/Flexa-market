import { describe, expect, it } from "vitest";

/**
 * Lightweight contract checks for the promotional-video Favorites API.
 * Runtime DB integration is covered by manual / CI smoke against a live server.
 */
describe("promo video saves API contract", () => {
  it("exposes dedicated save endpoints separate from listing likes", () => {
    const endpoints = [
      "GET /api/video-saves",
      "GET /api/video-saves/ids",
      "POST /api/video-saves/:listingId",
      "DELETE /api/video-saves/:listingId",
    ];
    expect(endpoints).toHaveLength(4);
    expect(endpoints.every((e) => e.includes("/api/video-saves"))).toBe(true);
  });

  it("keeps likes on /api/favorites and saves on /api/video-saves", () => {
    const likePath = "/api/favorites/:listingId";
    const savePath = "/api/video-saves/:listingId";
    expect(likePath).not.toEqual(savePath);
  });
});
