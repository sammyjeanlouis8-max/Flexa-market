/**
 * Flexa Boost APIs — my-active, estimate, initiate/confirm, video-only, analytics.
 * Paid initiation remains blocked on Android digital-purchase guard.
 */
import { Platform } from "react-native";
import { getApiBase } from "./api";

export type ActiveBoost = {
  listingId: number;
  title: string;
  price?: number | string;
  thumbnail?: string | null;
  boostVideoUrl?: string | null;
  boostStartAt?: string | null;
  boostExpiresAt?: string | null;
  viewCount?: number;
  impressions?: number;
  clicks?: number;
  boostId: number;
  plan?: string;
  budget?: number;
  dailyBudget?: number | null;
  durationDays?: number | null;
  estimatedSpentUsd?: number;
  remainingBudgetUsd?: number;
  isExpired?: boolean;
};

export type BoostEstimate = {
  price?: number;
  currency?: string;
  plan?: string;
  durationDays?: number;
  [key: string]: unknown;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function authedFetch(
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

/** Android Play digital goods cannot initiate paid boost from the app. */
export function isPaidBoostBlockedOnPlatform(): boolean {
  return Platform.OS === "android";
}

export async function fetchMyActiveBoosts(opts: AuthOpts): Promise<ActiveBoost[]> {
  const res = await authedFetch("/boost/my-active", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `My boosts failed (${res.status})`);
  return Array.isArray(data.boosts) ? data.boosts : [];
}

export async function estimateBoost(
  body: { listingId?: number; plan?: string; durationDays?: number; budget?: number },
  opts: AuthOpts,
): Promise<BoostEstimate> {
  const res = await authedFetch("/boost/estimate", { ...opts, method: "POST", body });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Estimate failed (${res.status})`);
  return data as BoostEstimate;
}

export async function initiateListingBoost(
  listingId: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<any> {
  if (isPaidBoostBlockedOnPlatform()) {
    throw new Error("ANDROID_DIGITAL_PURCHASE_UNAVAILABLE");
  }
  const res = await authedFetch(`/listings/${listingId}/boost/initiate`, {
    ...opts,
    method: "POST",
    body,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || data.code || `Boost initiate failed (${res.status})`);
  return data;
}

export async function confirmListingBoost(
  listingId: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<any> {
  if (isPaidBoostBlockedOnPlatform()) {
    throw new Error("ANDROID_DIGITAL_PURCHASE_UNAVAILABLE");
  }
  const res = await authedFetch(`/listings/${listingId}/boost/confirm`, {
    ...opts,
    method: "POST",
    body,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || data.code || `Boost confirm failed (${res.status})`);
  return data;
}

export async function createVideoOnlyBoost(
  body: {
    videoUrl: string;
    ctaType?: string;
    externalLink?: string;
    whatsappNumber?: string;
    ctaText?: string;
    budget: number;
    audienceCountry?: string;
    audienceGender?: string;
    audienceAgeMin?: number;
    audienceAgeMax?: number;
    audienceCity?: string;
  },
  opts: AuthOpts,
): Promise<any> {
  if (isPaidBoostBlockedOnPlatform()) {
    throw new Error("ANDROID_DIGITAL_PURCHASE_UNAVAILABLE");
  }
  const res = await authedFetch("/boost/video-only", { ...opts, method: "POST", body });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || data.code || `Video boost failed (${res.status})`);
  return data;
}

export async function cancelBoost(boostId: number, opts: AuthOpts): Promise<void> {
  const res = await authedFetch(`/boost/${boostId}/cancel`, { ...opts, method: "POST", body: {} });
  if (res.ok || res.status === 204) return;
  const data = await readJson(res);
  throw new Error(data.error || `Cancel failed (${res.status})`);
}

export async function patchBoostVideo(
  boostId: number,
  videoUrl: string | null,
  opts: AuthOpts,
): Promise<any> {
  const res = await authedFetch(`/boost/${boostId}/video`, {
    ...opts,
    method: "PATCH",
    body: { videoUrl },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Video update failed (${res.status})`);
  return data;
}

export async function fetchBoostAnalytics(opts: AuthOpts): Promise<any> {
  const res = await authedFetch("/boost-analytics", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Analytics failed (${res.status})`);
  return data;
}

export async function fetchBoostAnalyticsDetail(
  boostId: number,
  opts: AuthOpts,
): Promise<any> {
  const res = await authedFetch(`/boost-analytics/${boostId}`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Analytics detail failed (${res.status})`);
  return data;
}

export async function createBoosterCampaign(
  body: Record<string, unknown> & { mode: "draft" | "launch" },
  opts: AuthOpts,
): Promise<any> {
  if (body.mode === "launch" && isPaidBoostBlockedOnPlatform()) {
    throw new Error("ANDROID_DIGITAL_PURCHASE_UNAVAILABLE");
  }
  const res = await authedFetch("/booster/campaigns", { ...opts, method: "POST", body });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || data.code || `Campaign failed (${res.status})`);
  return data;
}

export async function fetchBoosterCampaigns(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/booster/campaigns", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Campaigns failed (${res.status})`);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.campaigns)) return data.campaigns;
  return [];
}

export async function pauseBoosterCampaign(id: number, opts: AuthOpts): Promise<void> {
  const res = await authedFetch(`/booster/campaigns/${id}/pause`, {
    ...opts,
    method: "POST",
    body: {},
  });
  if (!res.ok) {
    const data = await readJson(res);
    throw new Error(data.error || `Pause failed (${res.status})`);
  }
}

export async function resumeBoosterCampaign(id: number, opts: AuthOpts): Promise<void> {
  const res = await authedFetch(`/booster/campaigns/${id}/resume`, {
    ...opts,
    method: "POST",
    body: {},
  });
  if (!res.ok) {
    const data = await readJson(res);
    throw new Error(data.error || `Resume failed (${res.status})`);
  }
}
