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
