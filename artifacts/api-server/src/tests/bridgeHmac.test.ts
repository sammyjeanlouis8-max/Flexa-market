import { afterEach, describe, expect, it } from "vitest";
import type { NextFunction, Response } from "express";
import { bridgeSignature, isWholesaleCreditSource, requireBridgeHmac, type RawBodyRequest } from "../lib/bridge";

const originalSecret = process.env.FLEXA_BRIDGE_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.FLEXA_BRIDGE_SECRET;
  else process.env.FLEXA_BRIDGE_SECRET = originalSecret;
});

function request(headers: Record<string, string>, body = Buffer.from('{"query":"sam"}')): RawBodyRequest {
  return {
    rawBody: body,
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as RawBodyRequest;
}

function response() {
  const state = { status: 200, body: undefined as unknown };
  const res = {
    status(code: number) { state.status = code; return res; },
    json(body: unknown) { state.body = body; return res; },
  } as unknown as Response;
  return { res, state };
}

describe("bridge HMAC middleware", () => {
  it("matches the fixed Laravel HMAC-SHA256 fixture byte-for-byte", () => {
    const body = "{\"destination_user_id\":\"user-token\",\"source_user_id\":\"42\",\"amount_cents\":950,\"source_app\":\"wholesale\",\"note\":\"test\"}";
    expect(bridgeSignature("laravel-fixture-secret", "1710000000", "credit-0001", body))
      .toBe("3e80c0a055b8e8342758117c07df4ebdd1ebe3caefc0fc407c4049b829b2bf9c");
    expect(isWholesaleCreditSource(JSON.parse(body))).toBe(true);
    expect(isWholesaleCreditSource({ sourceApp: "wholesale" })).toBe(false);
    expect(isWholesaleCreditSource({})).toBe(false);
  });

  it("accepts a valid signature over the exact raw body", () => {
    process.env.FLEXA_BRIDGE_SECRET = "test-only-secret";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const idempotencyKey = "request-1";
    const rawBody = Buffer.from('{"query":"sam"}');
    const signature = bridgeSignature(process.env.FLEXA_BRIDGE_SECRET, timestamp, idempotencyKey, rawBody);
    const req = request({
      "x-flexa-timestamp": timestamp,
      "x-flexa-idempotency-key": idempotencyKey,
      "x-flexa-signature": signature,
    }, rawBody);
    const { res } = response();
    let called = false;
    requireBridgeHmac(req, res, (() => { called = true; }) as NextFunction);
    expect(called).toBe(true);
  });

  it("rejects invalid and expired signatures", () => {
    process.env.FLEXA_BRIDGE_SECRET = "test-only-secret";
    for (const [timestamp, corrupt] of [
      [String(Math.floor(Date.now() / 1000)), true],
      [String(Math.floor(Date.now() / 1000) - 301), false],
    ] as const) {
      const idempotencyKey = "request-2";
      const valid = bridgeSignature(process.env.FLEXA_BRIDGE_SECRET, timestamp, idempotencyKey, '{"query":"sam"}');
      const signature = corrupt
        ? `${valid.slice(0, -1)}${valid.endsWith("0") ? "1" : "0"}`
        : valid;
      const { res, state } = response();
      requireBridgeHmac(request({
        "x-flexa-timestamp": timestamp,
        "x-flexa-idempotency-key": idempotencyKey,
        "x-flexa-signature": signature,
      }), res, (() => undefined) as NextFunction);
      expect(state.status).toBe(401);
    }
  });
});