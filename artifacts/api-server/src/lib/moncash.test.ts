import { describe, expect, it } from "vitest";
import {
  monCashPaymentSucceeded,
  monCashPaymentTerminalFailure,
  parseMonCashTransactionResult,
} from "./moncash";

describe("MonCash transaction parsing", () => {
  it("accepts the documented snake_case transaction ID", () => {
    expect(parseMonCashTransactionResult({
      payment: {
        reference: "wallet_topup_12_123",
        transaction_id: "987654",
        cost: 1_000,
        message: "successful",
        payer: "50937000000",
      },
    })).toEqual({
      reference: "wallet_topup_12_123",
      transactionId: "987654",
      cost: 1_000,
      message: "successful",
      payer: "50937000000",
    });
  });

  it("normalizes a numeric transaction ID", () => {
    expect(parseMonCashTransactionResult({
      payment: {
        reference: "wallet_topup_12_124",
        transaction_id: 987655,
        cost: "1000",
        message: "successful",
      },
    }).transactionId).toBe("987655");
  });

  it.each([
    {},
    { payment: {} },
    { payment: { reference: "x", transaction_id: "1", cost: 0, message: "successful" } },
    { payment: { reference: "x", transaction_id: "1", cost: 10, message: "" } },
  ])("rejects malformed or non-payable provider data", (value) => {
    expect(() => parseMonCashTransactionResult(value)).toThrow();
  });
});

describe("MonCash terminal status handling", () => {
  it("credits only the documented final success message", () => {
    expect(monCashPaymentSucceeded("successful")).toBe(true);
    expect(monCashPaymentSucceeded("Successful")).toBe(true);
    expect(monCashPaymentSucceeded("paid")).toBe(false);
    expect(monCashPaymentSucceeded("pending")).toBe(false);
  });

  it.each(["failed", "cancelled", "canceled", "expired", "rejected"])(
    "recognizes %s as a terminal failure",
    (status) => expect(monCashPaymentTerminalFailure(status)).toBe(true),
  );
});