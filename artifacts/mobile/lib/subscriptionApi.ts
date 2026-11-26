/**
 * Subscription plans + current status.
 * Purchase initiation (checkout / wallet-pay) is intentionally not exposed —
 * Play/App Store digital goods policy blocks in-app purchases on native apps.
 */
import { getApiBase } from "./api";

export type SubscriptionPlanId = "basic" | "standard" | "premium" | "vip";

export type PlanFeature = { key: string; count?: number };

export type SubscriptionPlan = {
  id: SubscriptionPlanId | string;
  name: string;
  priceUsd: number;
  tier: number;
  videoEnabled: boolean;
  maxListings: number | null;
  featuredBadge: boolean;
  features: PlanFeature[];
};

export type MySubscription = {
  plan: string;
  planName: string;
  tier: number;
  videoEnabled: boolean;
  maxListings: number | null;
  featuredBadge: boolean;
  priceUsd: number;
  expiresAt: string | null;
  isExpired: boolean;
  gracePeriodActive: boolean;
  graceUntil: string | null;
  nextBillingDate: string | null;
  cancelAtPeriodEnd: boolean;
  status: string;
  stripeSubscriptionId: string | null;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchSubscriptionPlans(opts?: {
  signal?: AbortSignal;
}): Promise<SubscriptionPlan[]> {
  const res = await fetch(`${getApiBase()}/subscription/plans`, {
    headers: { Accept: "application/json" },
    signal: opts?.signal,
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
  if (!res.ok) throw new Error(data.error || `My subscription failed (${res.status})`);
  return {
    plan: String(data.plan ?? "basic"),
    planName: String(data.planName ?? "Basic"),
    tier: Number(data.tier ?? 0),
    videoEnabled: Boolean(data.videoEnabled),
    maxListings: data.maxListings == null ? null : Number(data.maxListings),
    featuredBadge: Boolean(data.featuredBadge),
    priceUsd: Number(data.priceUsd ?? 0),
    expiresAt: data.expiresAt ?? null,
    isExpired: Boolean(data.isExpired),
    gracePeriodActive: Boolean(data.gracePeriodActive),
    graceUntil: data.graceUntil ?? null,
    nextBillingDate: data.nextBillingDate ?? null,
    cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
    status: String(data.status ?? "none"),
    stripeSubscriptionId: data.stripeSubscriptionId ?? null,
  };
}

export async function cancelSubscription(
  opts: AuthOpts,
): Promise<{ ok: boolean; accessUntil: string | null }> {
  const res = await fetch(`${getApiBase()}/subscription/cancel`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Cancel failed (${res.status})`);
  return { ok: Boolean(data.ok ?? true), accessUntil: data.accessUntil ?? null };
}

export async function uncancelSubscription(opts: AuthOpts): Promise<{ ok: boolean }> {
  const res = await fetch(`${getApiBase()}/subscription/uncancel`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Uncancel failed (${res.status})`);
  return { ok: Boolean(data.ok ?? true) };
}

/** Creole labels for plan feature keys returned by the API. */
export function featureLabel(feature: PlanFeature): string {
  const count = feature.count;
  switch (feature.key) {
    case "subscription.feature.maxListings":
      return `Jiska ${count ?? 0} lis`;
    case "subscription.feature.unlimitedListings":
      return "Lis ilimite";
    case "subscription.feature.sellerProfile":
      return "Kat/profil vendè";
    case "subscription.feature.messaging":
      return "Sistèm mesaj";
    case "subscription.feature.basicStats":
      return "Statistik debaz";
    case "subscription.feature.videoListings":
      return "Videyo sou lis ou";
    case "subscription.feature.superiorVisibility":
      return "Vizibilite siperyè nan rechèch";
    case "subscription.feature.categoryPriority":
      return "Piyòrite nan kateyori";
    case "subscription.feature.vipBadge":
      return "Badge VIP + fache nan tèt lis";
    case "subscription.feature.prioritySupport":
      return "Sipò prioritè";
    default:
      return feature.key.replace(/^subscription\.feature\./, "");
  }
}

export function fmtSubDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-HT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
