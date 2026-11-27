import { describe, expect, it } from "vitest";
import { currencyDecimals, fromMinorUnits, toMinorUnits } from "../lib/restaurantMoney";

describe("restaurantMoney", () => {
  it("uses 2 decimals for USD and 0 for JPY", () => {
    expect(currencyDecimals("USD")).toBe(2);
    expect(currencyDecimals("JPY")).toBe(0);
  });

  it("round-trips without float drift for common amounts", () => {
    expect(toMinorUnits(10.5, "USD")).toBe(1050);
    expect(fromMinorUnits(1050, "USD")).toBe(10.5);
    expect(toMinorUnits(19.99, "USD")).toBe(1999);
    expect(toMinorUnits(100, "JPY")).toBe(100);
  });
});
