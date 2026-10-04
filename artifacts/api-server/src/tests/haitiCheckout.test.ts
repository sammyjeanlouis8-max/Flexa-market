import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initiateHaitiCheckout } from "../../../marketplace/src/lib/haitiCheckout";

const input = { provider: "moncash", amountHtg: 1000, phone: "50900000000" };
beforeEach(() => { vi.stubGlobal("navigator", { onLine: true }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Haiti checkout client", () => {
  it("ends a hung request after 45 seconds and never retries it", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: unknown, _init?: RequestInit) => new Promise<never>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const promise = initiateHaitiCheckout(input, "synthetic");
    const rejected = expect(promise).rejects.toMatchObject({ translationKey: "haitiCheckout.timeout" });
    await vi.advanceTimersByTimeAsync(45_000);
    await rejected;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not create an order while offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(initiateHaitiCheckout(input, "synthetic")).rejects.toMatchObject({ translationKey: "haitiCheckout.offline" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a valid checkout with the original amount and one request", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(JSON.stringify({
      redirectUrl: "https://moncash.example.invalid/pay?token=synthetic", paymentRef: "synthetic-reference",
    })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(initiateHaitiCheckout(input, "synthetic")).resolves.toMatchObject({ paymentRef: "synthetic-reference" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual(input);
  });

  it.each([{}, { redirectUrl: "http://example.invalid/pay" }, { redirectUrl: "javascript:alert(1)" }])(
    "rejects a missing or unsafe checkout link", async (data) => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(data))));
      await expect(initiateHaitiCheckout(input, null)).rejects.toMatchObject({ translationKey: "haitiCheckout.invalid" });
    },
  );

  it("bounds a stalled JSON response body as well", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: () => new Promise<never>(() => {}) })));
    const promise = initiateHaitiCheckout(input, null);
    const rejected = expect(promise).rejects.toMatchObject({ translationKey: "haitiCheckout.timeout" });
    await vi.advanceTimersByTimeAsync(45_000);
    await rejected;
  });

  it("reports provider failure without accepting or retrying a checkout", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "unconfirmed" }), { status: 504 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(initiateHaitiCheckout(input, null)).rejects.toMatchObject({ translationKey: "haitiCheckout.unavailable" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});