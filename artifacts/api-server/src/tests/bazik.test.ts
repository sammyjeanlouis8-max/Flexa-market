import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BazikApiError,
  bazikCreationDefinitelyRejected,
  bazikPaymentSucceeded,
  bazikWithdrawalDefinitelyRejected,
  getBazikAccessToken,
  normalizeBazikPayment,
  normalizeBazikTransfer,
  retrieveBazikWalletBalance,
  verifyBazikWebhookSignature,
} from "../lib/bazik";
import { monCashReady } from "../lib/haiti-money-core";

const config = {
  userId: "test-user",
  secretKey: "test-secret",
  webhookSecret: "webhook-secret",
};

describe("Bazik MonCash adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("authenticates with the explicit server user-agent Bazik accepts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "test-access-token",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getBazikAccessToken(config)).resolves.toBe("test-access-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.bazik.io/token",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "FlexaMarket/1.0 (+https://flexamarket.com)",
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("reads payout funds from the documented balance endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      available: 728.25,
      reserved: 0,
      currency: "HTG",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(retrieveBazikWalletBalance("test-access-token")).resolves.toEqual({
      availableHtg: 728.25,
      reservedHtg: 0,
      currency: "HTG",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.bazik.io/balance",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-access-token",
          "User-Agent": "FlexaMarket/1.0 (+https://flexamarket.com)",
        }),
      }),
    );
  });

  it("normalizes nested verified payment responses", () => {
    expect(normalizeBazikPayment({
      data: {
        orderId: "BZK_order_1",
        payment: {
          referenceId: "wallet_topup_42_100",
          transactionId: "txn_1",
          status: "succeeded",
          amount: 500,
        },
      },
    })).toMatchObject({
      orderId: "BZK_order_1",
      referenceId: "wallet_topup_42_100",
      transactionId: "txn_1",
      status: "succeeded",
      amountHtg: 500,
    });
  });

  it("does not invent a provider order identity when Bazik omits it", () => {
    expect(normalizeBazikPayment({
      referenceId: "wallet_topup_42_100",
      status: "successful",
      amount: 750,
      currency: "HTG",
    })).toMatchObject({
      orderId: "",
      referenceId: "wallet_topup_42_100",
      status: "successful",
      amountHtg: 750,
      currency: "HTG",
    });
  });

  it("normalizes Bazik gdes amounts returned by order verification", () => {
    expect(normalizeBazikPayment({
      orderId: "BZK_prodd4",
      referenceId: "wallet_topup_42_100",
      transactionId: "txn_750",
      status: "Successful",
      gdes: 750,
      currency: "HTG",
    })).toMatchObject({
      orderId: "BZK_prodd4",
      referenceId: "wallet_topup_42_100",
      transactionId: "txn_750",
      status: "successful",
      amountHtg: 750,
      currency: "HTG",
    });
  });

  it("accepts only Bazik terminal success statuses", () => {
    expect(bazikPaymentSucceeded("completed")).toBe(true);
    expect(bazikPaymentSucceeded("succeeded")).toBe(true);
    expect(bazikPaymentSucceeded("successful")).toBe(true);
    expect(bazikPaymentSucceeded("pending")).toBe(false);
    expect(bazikPaymentSucceeded("failed")).toBe(false);
  });

  it("verifies a fresh signed webhook and rejects stale timestamps", () => {
    const now = 1_800_000_000_000;
    const timestamp = String(Math.floor(now / 1000));
    const eventId = "evt_1";
    const rawBody = Buffer.from('{"type":"payment.succeeded","orderId":"BZK_order_1"}');
    const signature = createHmac("sha256", config.webhookSecret)
      .update(`${timestamp}.${eventId}.${rawBody.toString("utf8")}`)
      .digest("hex");

    expect(verifyBazikWebhookSignature({
      config, rawBody, timestamp, eventId, signature, now,
    })).toBe(true);
    expect(verifyBazikWebhookSignature({
      config,
      rawBody,
      timestamp: String(Math.floor((now - 10 * 60 * 1000) / 1000)),
      eventId,
      signature,
      now,
    })).toBe(false);
  });

  it("requires all Bazik credentials before reporting MonCash ready", () => {
    const base = { enabled: true, clientId: "", clientSecret: "" };
    expect(monCashReady({
      ...base,
      bazikUserId: "user",
      bazikSecretKey: "secret",
      bazikWebhookSecret: "",
    })).toBe(false);
    expect(monCashReady({
      ...base,
      bazikUserId: "user",
      bazikSecretKey: "secret",
      bazikWebhookSecret: "webhook",
    })).toBe(true);
  });

  it("releases an initiation claim only after a definite 4xx creation rejection", () => {
    expect(bazikCreationDefinitelyRejected(
      new BazikApiError("invalid request", "payment creation", 400),
    )).toBe(true);
    expect(bazikCreationDefinitelyRejected(
      new BazikApiError("provider unavailable", "payment creation", 503),
    )).toBe(false);
    expect(bazikCreationDefinitelyRejected(
      new BazikApiError("request timeout", "payment creation", 408),
    )).toBe(false);
    expect(bazikCreationDefinitelyRejected(
      new BazikApiError("rate limited", "payment creation", 429),
    )).toBe(false);
    expect(bazikCreationDefinitelyRejected(new Error("network timeout"))).toBe(false);
  });

  it("normalizes Bazik transfer identities and statuses", () => {
    expect(normalizeBazikTransfer({
      transaction_id: "TRF_123",
      status: "pending",
      provider: "moncash",
      amount: 500,
      fees: 25,
      total: 525,
      currency: "HTG",
      wallet: "50937123456",
      referenceId: "fm_cashout_7",
    })).toEqual({
      transactionId: "TRF_123",
      status: "processing",
      provider: "moncash",
      amountHtg: 500,
      feesHtg: 25,
      totalHtg: 525,
      currency: "HTG",
      wallet: "50937123456",
      referenceId: "fm_cashout_7",
      failureReason: undefined,
    });
  });

  it("normalizes nested snake-case transfer webhook responses", () => {
    expect(normalizeBazikTransfer({
      data: {
        transfer: {
          transaction_id: "TRF_nested_1",
          status: "completed",
          provider: "moncash",
          gdes: 300,
          fee: 15,
          total_cost: 315,
          currency: "htg",
          reference_id: "fm_cashout_9",
          recipient: { wallet: "+509 37 12 34 56" },
        },
      },
    })).toEqual({
      transactionId: "TRF_nested_1",
      status: "successful",
      provider: "moncash",
      amountHtg: 300,
      feesHtg: 15,
      totalHtg: 315,
      currency: "HTG",
      wallet: "50937123456",
      referenceId: "fm_cashout_9",
      failureReason: undefined,
    });
  });

  it("only refunds definite withdrawal creation rejections", () => {
    expect(bazikWithdrawalDefinitelyRejected(
      new BazikApiError("insufficient provider funds", "withdrawal creation", 402),
    )).toBe(true);
    expect(bazikWithdrawalDefinitelyRejected(
      new BazikApiError("provider unavailable", "withdrawal creation", 503),
    )).toBe(false);
    expect(bazikWithdrawalDefinitelyRejected(
      new BazikApiError("unknown conflict", "withdrawal creation", 409),
    )).toBe(false);
  });
});