import { describe, expect, it } from "vitest";
import { isValidBusinessPhone, normalizeDialablePhone } from "../lib/restaurantPhone";

describe("restaurantPhone", () => {
  it("normalizes international numbers", () => {
    expect(normalizeDialablePhone("+509 36 12 3456")).toBe("+50936123456");
    expect(normalizeDialablePhone("(509) 3612-3456")).toBe("50936123456");
  });

  it("accepts valid E.164-ish lengths", () => {
    expect(isValidBusinessPhone("+50936123456")).toBe(true);
    expect(isValidBusinessPhone("+1 212 555 0100")).toBe(true);
    expect(isValidBusinessPhone("123")).toBe(false);
    expect(isValidBusinessPhone("")).toBe(false);
    expect(isValidBusinessPhone(null)).toBe(false);
  });
});
