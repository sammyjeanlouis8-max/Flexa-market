import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOME_PROMO_VIDEO_CARD_LIMIT,
  selectHomePromoCompanionProduct,
  selectHomePromoVideos,
} from "./homePromoCompanion.ts";

describe("native home promo companion", () => {
  it("caps videos at two", () => {
    assert.equal(HOME_PROMO_VIDEO_CARD_LIMIT, 2);
    const now = Date.parse("2026-11-10T12:00:00.000Z");
    const picked = selectHomePromoVideos(
      [
        { id: 1, boostStartAt: "2026-11-01T00:00:00.000Z", boostEndAt: "2026-12-01T00:00:00.000Z" },
        { id: 2, boostStartAt: "2026-11-09T00:00:00.000Z", boostEndAt: "2026-12-01T00:00:00.000Z" },
        { id: 3, boostStartAt: "2026-11-10T00:00:00.000Z", boostEndAt: null },
      ],
      HOME_PROMO_VIDEO_CARD_LIMIT,
      now,
    );
    assert.deepEqual(picked.map((v) => v.id), [3, 2]);
  });

  it("picks a different product for the empty promo column", () => {
    const picked = selectHomePromoCompanionProduct(
      [
        { id: 10, status: "available", country: "Haiti", images: ["a.jpg"] },
        { id: 11, status: "available", country: "Haiti", images: ["b.jpg"] },
      ],
      { excludeListingIds: [10], activeCountry: "Haiti" },
    );
    assert.equal(picked?.id, 11);
  });

  it("returns null when no companion is eligible", () => {
    const picked = selectHomePromoCompanionProduct(
      [{ id: 10, status: "available", country: "Haiti", images: ["a.jpg"] }],
      { excludeListingIds: [10], activeCountry: "Haiti" },
    );
    assert.equal(picked, null);
  });
});
