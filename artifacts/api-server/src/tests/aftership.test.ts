import { describe, expect, it, vi } from "vitest";
import {
  normalizeCarrier,
  normalizeTrackingPayload,
  getTracking,
  validateTrackingNumber,
  verifyAfterShipSignature,
} from "../lib/aftership";
import { createHmac } from "node:crypto";

describe("AfterShip adapter", () => {
  it("normalizes supported carrier names without exposing provider details", () => {
    expect(normalizeCarrier("Federal Express")).toBe("fedex");
    expect(normalizeCarrier("USPS")).toBe("usps");
  });

  it("rejects malformed tracking numbers", () => {
    expect(() => validateTrackingNumber("")).toThrow("invalid");
    expect(() => validateTrackingNumber("a".repeat(81))).toThrow("invalid");
    expect(validateTrackingNumber("9400 1234-AB")).toBe("9400 1234-AB");
  });

  it("keeps only real, timestamped carrier checkpoints", () => {
    const normalized = normalizeTrackingPayload({
      data: {
        tracking: {
          id: "provider-id",
          slug: "usps",
          tracking_number: "94001234",
          tag: "InTransit",
          checkpoints: [
            { checkpoint_id: "cp-1", tag: "InTransit", checkpoint_time: "2026-01-02T10:00:00Z", city: "Miami", country_name: "US" },
            { checkpoint_id: "missing-time", tag: "Delivered" },
          ],
        },
      },
    }, { slug: "usps", trackingNumber: "94001234" });
    expect(normalized.status).toBe("in_transit");
    expect(normalized.events).toHaveLength(1);
    expect(normalized.events[0]?.location).toBe("Miami, US");
  });

  it("normalizes the representative 2026-01 direct-msg and msg.tracking envelopes", () => {
    const direct = normalizeTrackingPayload({
      msg: {
        id: "direct-provider-id",
        slug: "ups",
        tracking_number: "1Z999AA10123456784",
        tag: "OutForDelivery",
        last_checkpoint_time: "2026-01-03T12:00:00Z",
        location: "Miami, FL",
      },
    }, { slug: "ups", trackingNumber: "1Z999AA10123456784" });
    expect(direct.providerTrackingId).toBe("direct-provider-id");
    expect(direct.status).toBe("out_for_delivery");
    expect(direct.lastLocation).toBe("Miami, FL");

    const nested = normalizeTrackingPayload({
      msg: {
        tracking: {
          id: "nested-provider-id",
          slug: "dhl",
          tracking_number: "1234567890",
          tag: "Delivered",
          checkpoints: [{
            checkpoint_id: "dhl-cp-1",
            tag: "Delivered",
            checkpoint_time: "2026-01-04T12:00:00Z",
            message: "Delivered",
          }],
        },
      },
    }, { slug: "dhl", trackingNumber: "1234567890" });
    expect(nested.providerTrackingId).toBe("nested-provider-id");
    expect(nested.status).toBe("delivered");
    expect(nested.events[0]?.status).toBe("delivered");
  });

  it("uses the official as-api-key header for the 2026-01 endpoint", async () => {
    process.env.AFTERSHIP_API_KEY = "server-only-test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          tracking: {
            id: "fixture-id",
            slug: "usps",
            tracking_number: "94001234",
            tag: "InTransit",
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await getTracking("USPS", "94001234");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["as-api-key"]).toBe("server-only-test-key");
    expect((init.headers as Record<string, string>)["aftership-api-key"]).toBeUndefined();
    vi.unstubAllGlobals();
    delete process.env.AFTERSHIP_API_KEY;
  });

  it("requires the separate webhook secret for signature verification", () => {
    const raw = Buffer.from('{"msg":"shipment"}');
    process.env.AFTERSHIP_WEBHOOK_SECRET = "test-secret";
    const signature = createHmac("sha256", "test-secret").update(raw).digest("base64");
    expect(verifyAfterShipSignature(raw, signature)).toBe(true);
    expect(verifyAfterShipSignature(raw, "bad")).toBe(false);
    delete process.env.AFTERSHIP_WEBHOOK_SECRET;
  });
});