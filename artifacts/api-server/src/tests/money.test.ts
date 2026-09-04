import { describe, expect, it } from "vitest";
import { centsToUsd, transferFeeCents, usdToCents } from "../lib/money";

describe("wallet transfer money helpers", () => {
  it("accepts only positive USD values with at most two decimal places", () => {
    expect(usdToCents("10")).toBe(1000);
    expect(usdToCents("10.5")).toBe(1050);
    expect(usdToCents("10.50")).toBe(1050);
    expect(usdToCents("10.005")).toBeNull();
    expect(usdToCents(0)).toBeNull();
    expect(usdToCents("-1")).toBeNull();
  });

  it("calculates the five-percent transfer fee by ceiling in cents", () => {
    expect(transferFeeCents(950)).toBe(48);
    expect(transferFeeCents(1)).toBe(1);
    expect(centsToUsd(902)).toBe(9.02);
  });
});