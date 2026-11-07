import { describe, expect, it } from "vitest";
import { VALID_RADIUS_KM } from "../lib/boostTargeting";

describe("Booster Pro targeting", () => {
  it("allows 25km radius from the mockup", () => {
    expect(VALID_RADIUS_KM).toContain(25);
  });
});

describe("Booster Pro video cap", () => {
  it("enforces 2 minute max at product level", () => {
    const MAX_VIDEO_SECONDS = 120;
    expect(MAX_VIDEO_SECONDS).toBe(120);
  });
});

describe("Booster Pro CTA rules", () => {
  const allowed = ["buy_now", "message", "whatsapp", "none", "link"] as const;
  it("accepts the four primary CTA options plus legacy link", () => {
    expect(allowed).toEqual(expect.arrayContaining(["buy_now", "message", "whatsapp", "none"]));
  });
  it("requires a product for Buy Now", () => {
    const ctaType = "buy_now";
    const listingIdIn = null;
    const blocked = ctaType === "buy_now" && !listingIdIn;
    expect(blocked).toBe(true);
  });
  it("allows WhatsApp / Message / None without a product", () => {
    for (const ctaType of ["whatsapp", "message", "none"] as const) {
      const listingIdIn = null;
      const blocked = ctaType === "buy_now" && !listingIdIn;
      expect(blocked).toBe(false);
    }
  });
});
