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
  const totals =
    data.totals ||
    data.summary ||
    data.overview || {
      impressions: data.totalImpressions ?? campaigns.reduce((s: number, c: any) => s + (c.impressions || 0), 0),
      clicks: data.totalClicks ?? campaigns.reduce((s: number, c: any) => s + (c.clicks || 0), 0),
      spend: data.totalSpend ?? campaigns.reduce((s: number, c: any) => s + (c.spend || 0), 0),
      videoViews: data.totalViews ?? campaigns.reduce((s: number, c: any) => s + (c.videoViews || 0), 0),
    };
  return { campaigns, totals };
}
