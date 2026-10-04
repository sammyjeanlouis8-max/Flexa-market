import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckoutTimeoutError, withCheckoutDeadline } from "../lib/checkoutDeadline";
import { createBazikMonCashPayment, bazikCreationDefinitelyRejected } from "../lib/bazik";
import { createPayment, getAccessToken, monCashCreationDefinitelyRejected, MonCashCheckoutError } from "../lib/moncash";

const config = { mode: "sandbox" as const, clientId: "test", clientSecret: "test", returnUrl: "https://example.invalid/return" };
const bazikInput = {
  config: { userId: "test", secretKey: "test", webhookSecret: "test" },
  accessToken: "synthetic", amountHtg: 1000, referenceId: "synthetic-reference",
  description: "test", successUrl: "https://example.invalid/success",
  errorUrl: "https://example.invalid/error", webhookUrl: "https://example.invalid/webhook",
};

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("checkout request deadlines without automatic payment retries", () => {
  it("settles even if an upstream operation ignores abort", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const run = vi.fn((s: AbortSignal) => { signal = s; return new Promise<never>(() => {}); });
    const result = withCheckoutDeadline("test checkout", run, 20_000);
    const rejected = expect(result).rejects.toBeInstanceOf(CheckoutTimeoutError);
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    expect(signal?.aborted).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its timer after successful completion", async () => {
    vi.useFakeTimers();
    await expect(withCheckoutDeadline("test", async () => "done", 20_000)).resolves.toBe("done");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["bazik", "official", "authentication"])("bounds a stalled %s request", async (adapter) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: unknown, _init?: RequestInit) => new Promise<never>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const promise = adapter === "bazik" ? createBazikMonCashPayment(bazikInput)
      : adapter === "official" ? createPayment(config, "synthetic", "order", 1000) : getAccessToken(config);
    const rejected = expect(promise).rejects.toBeInstanceOf(CheckoutTimeoutError);
    await vi.advanceTimersByTimeAsync(adapter === "authentication" ? 15_000 : 20_000);
    await rejected;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(bazikCreationDefinitelyRejected(new CheckoutTimeoutError("creation"))).toBe(false);
    expect(monCashCreationDefinitelyRejected(new CheckoutTimeoutError("creation"))).toBe(false);
  });

  it("also bounds a stalled payment response body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200, text: () => new Promise<string>(() => {}),
    })));
    const promise = createBazikMonCashPayment(bazikInput);
    const rejected = expect(promise).rejects.toBeInstanceOf(CheckoutTimeoutError);
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
  });

  it("keeps normal MonCash authentication and checkout working", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "synthetic" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ payment_token: { token: "synthetic-payment" } }))));
    const token = await getAccessToken(config);
    const checkout = await createPayment(config, token, "order", 1000);
    expect(checkout.redirectUrl).toMatch(/^https:\/\//);
    expect(checkout.paymentToken).toBe("synthetic-payment");
  });

  it("keeps a normal Bazik checkout working with one request and a cleared timer", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      orderId: "synthetic-order", redirectUrl: "https://example.invalid/pay",
      referenceId: bazikInput.referenceId, amount: 1000, currency: "HTG", status: "pending",
    })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createBazikMonCashPayment(bazikInput)).resolves.toMatchObject({
      orderId: "synthetic-order", redirectUrl: "https://example.invalid/pay",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([408, 429, 500, 502, 504])("does not reject an uncertain HTTP %s creation", (status) => {
    expect(monCashCreationDefinitelyRejected(new MonCashCheckoutError("payment creation", status))).toBe(false);
  });

  it("recognizes an explicit creation rejection but not an authentication error", () => {
    expect(monCashCreationDefinitelyRejected(new MonCashCheckoutError("payment creation", 400))).toBe(true);
    expect(monCashCreationDefinitelyRejected(new MonCashCheckoutError("authentication", 401))).toBe(false);
  });
});