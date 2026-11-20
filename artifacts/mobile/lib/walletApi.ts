/**
 * Promo Account helpers for the native Android app.
 * Money wallet surfaces (balance, history, top-up, transfer) are not exposed in-app.
 * Only the delivery code (`accountNumber`) is read from GET /wallet/balance.
 */
import { getApiBase } from "./api";

type AuthOpts = { token: string; signal?: AbortSignal };

async function authed(path: string, opts: AuthOpts): Promise<Response> {
  return fetch(`${getApiBase()}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/**
 * Delivery code for Promo Account = `accountNumber` on the promo wallet row.
 * Not a referral code, coupon, or per-order `verificationCode` (delivery PIN).
 */
export async function fetchDeliveryCode(opts: AuthOpts): Promise<string | null> {
  const res = await authed("/wallet/balance", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Delivery code failed (${res.status})`);
  const code = data.accountNumber;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}
