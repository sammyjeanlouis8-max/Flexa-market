import { describe, expect, it } from "vitest";
import {
  isHaitiPhone,
  makeHaitiQuote,
  monCashReady,
  natCashReady,
  parsePositiveMoney,
} from "../lib/haiti-money-core";

describe("Haiti local-money quote contract", () => {
  it("rejects non-finite and non-positive amounts", () => {
    expect(parsePositiveMoney(Number.NaN)).toBeNull();
    expect(parsePositiveMoney(Infinity)).toBeNull();
    expect(parsePositiveMoney(0)).toBeNull();
    expect(() => makeHaitiQuote({
      direction: "topup",
      provider: "moncash",
      amountHtg: 100,
      rateUsed: 0,
    })).toThrow();
  });

  it("rounds topup and cashout values to deterministic cents", () => {
    expect(makeHaitiQuote({
      direction: "topup",
      provider: "moncash",
      amountHtg: 100,
      rateUsed: 132.5,
      bonusPct: 0,
    })).toMatchObject({ amountHtg: 100, amountUsd: 0.75, rateUsed: 132.5 });

    expect(makeHaitiQuote({
      direction: "cashout",
      provider: "natcash",
      amountUsd: 10.005,
      rateUsed: 132.5,
      feePct: 0.02,
    })).toMatchObject({ amountUsd: 10.01, feeUsd: 0.2, netAmountUsd: 9.81, amountHtg: 1299.83 });
  });
});

describe("Haiti provider readiness", () => {
  it("requires MonCash credentials and never treats NatCash config as an adapter", () => {
    expect(monCashReady({ enabled: true, clientId: "id", clientSecret: "" })).toBe(false);
    expect(monCashReady({ enabled: true, clientId: "id", clientSecret: "secret" })).toBe(true);
    expect(natCashReady({ enabled: true, apiBaseUrl: "https://example.invalid", password: "secret" })).toBe(false);
  });

  it("accepts only Haitian phone number shapes", () => {
    expect(isHaitiPhone("+509 3700 1234")).toBe(true);
    expect(isHaitiPhone("37001234")).toBe(true);
    expect(isHaitiPhone("+1 202 555 0100")).toBe(false);
  });
});