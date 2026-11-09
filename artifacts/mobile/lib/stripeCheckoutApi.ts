/**
 * Stripe Checkout for physical marketplace goods (allowed on Android).
 * Opens hosted Stripe Checkout URL via system browser — not an in-app marketplace shell.
 * Digital goods (wallet top-up, boost, subscription, music) stay blocked by server guard.
 *
 * Body fields match POST /api/stripe/checkout (shippingName, shippingStreet, …).
 */
import { getApiBase } from "./api";

export type StripeCheckoutBody = {
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
  deliveryMethod?: "motorcycle" | "car" | "pickup" | string;
  deliveryPickupCity?: string;
  /** Prefer hosted so we can open session.url in the system browser. */
  uiMode?: "hosted" | "embedded";
  saveCard?: boolean;
};

export type StripeCheckoutSession = {
  sessionId: string;
  url: string | null;
  publishableKey?: string | null;
  uiMode?: string;
  capabilities?: { card?: boolean; reason?: string };
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function createStripeCheckoutSession(
  body: StripeCheckoutBody,
  opts: AuthOpts,
): Promise<StripeCheckoutSession> {
  const res = await fetch(`${getApiBase()}/stripe/checkout`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
      // Identify as native for logging; physical /stripe/checkout is not in the digital guard list.
      "User-Agent": "FlexaMarketAndroid",
    },
    body: JSON.stringify({
      listingId: body.listingId,
      shippingName: body.shippingName,
      shippingPhone: body.shippingPhone,
      shippingEmail: body.shippingEmail,
      shippingStreet: body.shippingStreet,
      shippingCity: body.shippingCity,
      shippingRegion: body.shippingRegion,
      shippingZip: body.shippingZip,
      shippingCountry: body.shippingCountry,
      deliveryFeeUsd: body.deliveryFeeUsd,
      deliveryMethod: body.deliveryMethod,
      deliveryPickupCity: body.deliveryPickupCity,
      uiMode: body.uiMode === "embedded" ? "embedded" : undefined,
      saveCard: body.saveCard,
    }),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) {
    const err = new Error(data.error || `Stripe checkout failed (${res.status})`) as Error & {
      code?: string;
    };
    err.code = data.code;
    throw err;
  }
  return {
    sessionId: String(data.sessionId ?? ""),
    url: data.url ?? null,
    publishableKey: data.publishableKey ?? null,
    uiMode: data.uiMode,
    capabilities: data.capabilities,
  };
}
