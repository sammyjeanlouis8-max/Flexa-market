import { loadStripe, type Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null> | null = null;
let cachedKey: string | null = null;

export type StripeCapabilities = {
  applePay: boolean;
  googlePay: boolean;
  card: boolean;
  link: boolean;
  flexaCard: boolean;
  currency: string;
  reason?: string;
};

export async function fetchStripeConfig(opts?: {
  country?: string | null;
  token?: string | null;
}): Promise<{ publishableKey: string; capabilities: StripeCapabilities }> {
  const params = new URLSearchParams();
  if (opts?.country) params.set("country", opts.country);
  const headers: Record<string, string> = {};
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`/api/stripe/config?${params}`, { headers });
  if (!res.ok) throw new Error("Stripe config unavailable");
  return res.json();
}

export function getStripePromise(publishableKey: string): Promise<Stripe | null> {
  if (!stripePromise || cachedKey !== publishableKey) {
    cachedKey = publishableKey;
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}
