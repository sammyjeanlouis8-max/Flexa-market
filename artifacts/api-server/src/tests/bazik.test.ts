import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BazikApiError,
  bazikCreationDefinitelyRejected,
  bazikPaymentSucceeded,
  normalizeBazikPayment,
  verifyBazikWebhookSignature,
} from "../lib/bazik";
import { monCashReady } from "../lib/haiti-money-core";

const config = {
  userId: "test-user",
  secretKey: "test-secret",
  webhookSecret: "webhook-secret",
};

describe("Bazik MonCash adapter", () => {
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

  it("accepts only documented successful statuses", () => {
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
});