/**
 * BNPL checkout for physical marketplace goods (allowed on Android).
 * POST /api/bnpl/checkout → Stripe hosted session with Klarna/Affirm/Afterpay.
 * Opens via expo-web-browser — not a marketplace WebView shell.
 */
import { getApiBase } from "./api";

export type BnplCheckoutBody = {
  listingId: number;
  shippingName: string;
  shippingPhone: string;
  shippingEmail?: string;
  shippingStreet: string;
  shippingCity: string;
  shippingRegion?: string;
  shippingZip?: string;
  shippingCountry?: string;
  deliveryFeeUsd?: number;
  deliveryMethod?: string;
  deliveryPickupCity?: string;
  bnplMethod?: "klarna" | "affirm" | "afterpay_clearpay";
};

export type BnplCheckoutSession = {
  sessionUrl: string | null;
  sessionId: string;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function createBnplCheckoutSession(
  body: BnplCheckoutBody,
  opts: AuthOpts,
): Promise<BnplCheckoutSession> {
  const res = await fetch(`${getApiBase()}/bnpl/checkout`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
      "User-Agent": "FlexaMarketAndroid",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) {
    const err = new Error(data.error || `BNPL checkout failed (${res.status})`) as Error & {
      code?: string;
      eligibility?: unknown;
    };
    err.code = data.code;
    err.eligibility = data.eligibility;
    throw err;
  }
  return {
    sessionId: String(data.sessionId ?? ""),
    sessionUrl: data.sessionUrl ?? data.url ?? null,
  };
}
