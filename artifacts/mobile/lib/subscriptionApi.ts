import { getApiBase } from "./api";

export type SubscriptionPlan = {
  id: string;
  name: string;
  priceUsd: number;
  tier: number;
  videoEnabled?: boolean;
  maxListings?: number | null;
  featuredBadge?: boolean;
  features?: { key: string; count?: number }[];
};

export type MySubscription = {
  plan: string;
  planName: string;
  tier: number;
  videoEnabled?: boolean;
  maxListings?: number | null;
  featuredBadge?: boolean;
  priceUsd?: number;
  expiresAt: string | null;
  isExpired: boolean;
  status: string;
  cancelAtPeriodEnd?: boolean;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchSubscriptionPlans(
  opts: { signal?: AbortSignal } = {},
): Promise<SubscriptionPlan[]> {
  const res = await fetch(`${getApiBase()}/subscription/plans`, {
    headers: { Accept: "application/json" },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Plans failed (${res.status})`);
  return Array.isArray(data) ? data : [];
}

export async function fetchMySubscription(opts: AuthOpts): Promise<MySubscription> {
  const res = await fetch(`${getApiBase()}/subscription/my`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Subscription failed (${res.status})`);
  return data as MySubscription;
}

/** Pay vendor subscription with FM Wallet (Android unblocked). */
export async function paySubscriptionWithWallet(
  plan: string,
  opts: AuthOpts,
): Promise<{ ok: boolean; plan: string; expiresAt?: string }> {
  const res = await fetch(`${getApiBase()}/subscription/wallet-pay`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
      "User-Agent": "FlexaMarketAndroid/1.0.1",
    },
    body: JSON.stringify({ plan }),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) {
    const err = new Error(data.error || `Wallet pay failed (${res.status})`) as Error & {
      code?: string;
      needed?: number;
    };
    err.code = data.code;
    err.needed = data.needed;
    throw err;
  }
  return data;
}
