/**
 * Boost campaigns — methods, estimate, wallet initiate, my-active, analytics.
 * Paid initiate may return ANDROID_DIGITAL_PURCHASE_UNAVAILABLE on Play builds.
 */
import { getApiBase } from "./api";

export type BoostPlan = { id: string; days: number; basePrice: number };

export type BoostMethods = {
  country: string | null;
  allowedMethods: string[];
  plans: BoostPlan[];
  haitiDepartments?: string[] | null;
  validRadiusKm?: number[];
};

export type BoostEstimate = {
  estimatedReach: number;
  durationDays: number;
  budget: number;
  dailyBudget: number;
  amountPayable: number;
  estimateDisclaimer?: string;
};

export type ActiveBoost = {
  listingId: number;
  title: string;
  price?: number;
  thumbnail: string | null;
  boostVideoUrl: string | null;
  boostStartAt: string | null;
  boostExpiresAt: string | null;
  impressions: number;
  clicks: number;
  boostId: number;
  plan: string | null;
  budget: number;
  remainingBudgetUsd?: number;
  isExpired: boolean;
};

export type BoostAnalyticsSummary = {
  campaigns: Array<{
    boostId: number;
    listingId: number;
    title: string;
    thumbnail: string | null;
    status: string;
    budget: number;
    spend: number;
    remainingBudget: number;
    impressions: number;
    clicks: number;
    videoViews: number;
    ctr: number;
    startsAt: string | null;
    endsAt: string | null;
  }>;
  totals?: {
    impressions?: number;
    clicks?: number;
    spend?: number;
    videoViews?: number;
  };
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function authed(
  path: string,
  opts: AuthOpts & { method?: string; body?: unknown },
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${opts.token}`,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
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

export class ApiError extends Error {
  status: number;
  code?: string;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.code = data?.code;
    this.data = data;
  }
}

export async function fetchBoostMethods(opts: AuthOpts): Promise<BoostMethods> {
  const res = await authed("/boost/methods", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Boost methods failed (${res.status})`);
  return data as BoostMethods;
}

export async function estimateBoost(
  body: { plan: string; budget: number; audience?: Record<string, unknown> },
  opts: AuthOpts,
): Promise<BoostEstimate> {
  const res = await authed("/boost/estimate", { ...opts, method: "POST", body });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Boost estimate failed (${res.status})`);
  return data as BoostEstimate;
}

export async function initiateBoostWallet(
  listingId: number,
  body: {
    plan: string;
    budget: number;
    paymentMethod: "wallet";
    audience?: Record<string, unknown>;
  },
  opts: AuthOpts,
): Promise<any> {
  const res = await authed(`/listings/${listingId}/boost/initiate`, {
    ...opts,
    method: "POST",
    body,
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw new ApiError(data.error || `Boost initiate failed (${res.status})`, res.status, data);
  }
  return data;
}

export async function fetchMyActiveBoosts(opts: AuthOpts): Promise<ActiveBoost[]> {
  const res = await authed("/boost/my-active", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `My boosts failed (${res.status})`);
  return Array.isArray(data?.boosts) ? data.boosts : [];
}

export async function cancelBoost(boostId: number, opts: AuthOpts): Promise<void> {
  const res = await authed(`/boost/${boostId}/cancel`, { ...opts, method: "POST", body: {} });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Cancel boost failed (${res.status})`);
}

export type BoosterCampaign = {
  boostId: number;
  listingId: number;
  title: string;
  description?: string | null;
  thumbnail: string | null;
  boostVideoUrl: string | null;
  boostImageUrl?: string | null;
  adFormat?: string | null;
  status: string;
  impressions: number;
  clicks: number;
  skips?: number;
  videoViews?: number;
  budget: number;
  plan: string | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt?: string | null;
  canRenew?: boolean;
  durationSec?: number | null;
};

export type MyVideosTab = "active" | "under_review" | "rejected" | "expired";

export function campaignTab(
  status: string,
  endsAt?: string | null,
): MyVideosTab | "draft" | null {
  const s = (status || "").toLowerCase();
  if (s === "draft") return "draft";
  if (s === "rejected") return "rejected";
  if (s === "expired" || s === "completed" || s === "cancelled") return "expired";
  const pastEnd = endsAt ? new Date(endsAt).getTime() <= Date.now() : false;
  // Backend may still report active/paused after the campaign end date.
  if (pastEnd && (s === "active" || s === "paused" || !s)) return "expired";
  if (s === "active" || s === "paused") return "active";
  // pending / pending_review / processing → Under Review
  return "under_review";
}

export async function fetchBoosterCampaigns(opts: AuthOpts): Promise<BoosterCampaign[]> {
  const res = await authed("/booster/campaigns", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Booster campaigns failed (${res.status})`);
  const rows = Array.isArray(data.campaigns) ? data.campaigns : [];
  return rows.map((r: any) => {
    let status = String(r.status || "pending");
    const endsAt = r.endsAt ?? null;
    const expired = endsAt ? new Date(endsAt).getTime() <= Date.now() : false;
    if (expired && (status === "active" || status === "paused")) {
      status = "expired";
    }
    return {
      boostId: Number(r.boostId),
      listingId: Number(r.listingId),
      title: r.title || `Campaign #${r.boostId}`,
      description: r.description ?? null,
      thumbnail: r.thumbnail ?? null,
      boostVideoUrl: r.boostVideoUrl ?? null,
      boostImageUrl: r.boostImageUrl ?? null,
      adFormat: r.adFormat ?? "video",
      status,
      impressions: r.impressions ?? 0,
      clicks: r.clicks ?? 0,
      skips: r.skips ?? 0,
      videoViews: r.videoViews ?? 0,
      budget: Number(r.budget ?? 0),
      plan: r.plan ?? null,
      startsAt: r.startsAt ?? null,
      endsAt,
      createdAt: r.createdAt ?? null,
      canRenew: status === "expired" || status === "completed" || status === "cancelled",
      durationSec: r.durationSec ?? null,
    } as BoosterCampaign;
  });
}

export async function fetchBoosterMeta(opts: AuthOpts): Promise<{
  haitiDepartments: string[];
  communesByDepartment: Record<string, string[]>;
}> {
  const res = await authed("/booster/meta", opts);
  const data = await readJson(res);
  if (!res.ok) {
    // Fallback: methods endpoint has departments only
    const methods = await fetchBoostMethods(opts);
    return {
      haitiDepartments: methods.haitiDepartments || [],
      communesByDepartment: {},
    };
  }
  return {
    haitiDepartments: Array.isArray(data.haitiDepartments) ? data.haitiDepartments : [],
    communesByDepartment:
      data.communesByDepartment && typeof data.communesByDepartment === "object"
        ? data.communesByDepartment
        : {},
  };
}

export async function saveBoosterCampaign(
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<{ boostId: number; listingId: number; status: string }> {
  const res = await authed("/booster/campaigns", { ...opts, method: "POST", body });
  const data = await readJson(res);
  if (!res.ok) throw new ApiError(data.error || `Save campaign failed (${res.status})`, res.status, data);
  return {
    boostId: Number(data.boostId),
    listingId: Number(data.listingId),
    status: String(data.status || "draft"),
  };
}

export async function renewBoost(
  boostId: number,
  body: {
    plan?: string;
    budget?: number;
    audience?: Record<string, unknown>;
    idempotencyKey: string;
  },
  opts: AuthOpts,
): Promise<{
  renewed: boolean;
  idempotent: boolean;
  boostId: number;
  listingId: number;
  status: string;
  expiresAt?: string;
  amountCharged?: number;
  httpStatus: number;
}> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${opts.token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": body.idempotencyKey,
  };
  const res = await fetch(`${getApiBase()}/boost/${boostId}/renew`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      plan: body.plan,
      budget: body.budget,
      audience: body.audience,
      idempotencyKey: body.idempotencyKey,
    }),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new ApiError(data.error || `Renew failed (${res.status})`, res.status, data);
  return {
    renewed: !!data.renewed,
    idempotent: !!data.idempotent,
    boostId: Number(data.boostId),
    listingId: Number(data.listingId),
    status: String(data.status || "active"),
    expiresAt: data.expiresAt,
    amountCharged: data.amountCharged != null ? Number(data.amountCharged) : undefined,
    httpStatus: res.status,
  };
}

export async function cancelBoosterCampaign(boostId: number, opts: AuthOpts): Promise<void> {
  const res = await authed(`/boost/${boostId}/cancel`, { ...opts, method: "POST", body: {} });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Cancel failed (${res.status})`);
}

export async function fetchBoostAnalytics(
  opts: AuthOpts,
  params?: { range?: string; status?: string },
): Promise<BoostAnalyticsSummary> {
  const q = new URLSearchParams();
  if (params?.range) q.set("range", params.range);
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  const res = await authed(`/boost-analytics${qs ? `?${qs}` : ""}`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Boost analytics failed (${res.status})`);
  const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
  const metricVal = (m: any) =>
    m == null ? 0 : typeof m === "number" ? m : Number(m.value ?? m.count ?? 0) || 0;
  const summary = data.summary || data.totals || data.overview || {};
  const totals = {
    impressions:
      metricVal(summary.totalImpressions) ||
      campaigns.reduce((s: number, c: any) => s + (c.impressions || 0), 0),
    clicks:
      metricVal(summary.productClicks) ||
      metricVal(summary.totalClicks) ||
      campaigns.reduce((s: number, c: any) => s + (c.clicks || 0), 0),
    spend:
      metricVal(summary.totalBoostSpend) ||
      campaigns.reduce((s: number, c: any) => s + (c.spend || 0), 0),
    videoViews:
      metricVal(summary.totalVideoViews) ||
      campaigns.reduce((s: number, c: any) => s + (c.videoViews || 0), 0),
  };
  return { campaigns, totals };
}
