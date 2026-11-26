/**
 * Boost campaigns — my-active list + cancel (paid initiate blocked on store apps).
 */
import { getApiBase } from "./api";

export type ActiveBoost = {
  listingId: number;
  title: string;
  price: number;
  thumbnail: string | null;
  boostVideoUrl: string | null;
  boostStartAt: string | null;
  boostExpiresAt: string | null;
  viewCount: number;
  impressions: number;
  clicks: number;
  boostId: number;
  plan: string;
  budget: number;
  dailyBudget?: number | null;
  durationDays?: number | null;
  estimatedSpentUsd?: number;
  remainingBudgetUsd?: number;
  isExpired: boolean;
};

export const BOOST_PLANS = [
  { id: "1day" as const, days: 1, price: 2, label: "1 day", badge: null as string | null },
  { id: "3day" as const, days: 3, price: 5, label: "3 days", badge: "Popular" },
  { id: "7day" as const, days: 7, price: 10, label: "7 days", badge: "Best value" },
];

type AuthOpts = { token: string; signal?: AbortSignal };

function mediaOrigin(): string {
  return getApiBase().replace(/\/api\/?$/, "");
}

export function resolveBoostMediaUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/api/")) return `${mediaOrigin()}${value}`;
  if (value.startsWith("/objects/")) {
    return `${mediaOrigin()}/api/storage/objects/${value.slice("/objects/".length)}`;
  }
  if (value.startsWith("/")) return `${mediaOrigin()}${value}`;
  return `${mediaOrigin()}/api/storage/objects/${value}`;
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function mapBoost(raw: any): ActiveBoost {
  return {
    listingId: Number(raw.listingId),
    title: String(raw.title ?? ""),
    price: Number(raw.price ?? 0),
    thumbnail: resolveBoostMediaUrl(raw.thumbnail),
    boostVideoUrl: resolveBoostMediaUrl(raw.boostVideoUrl),
    boostStartAt: raw.boostStartAt ?? null,
    boostExpiresAt: raw.boostExpiresAt ?? null,
    viewCount: Number(raw.viewCount ?? 0),
    impressions: Number(raw.impressions ?? 0),
    clicks: Number(raw.clicks ?? 0),
    boostId: Number(raw.boostId),
    plan: String(raw.plan ?? ""),
    budget: Number(raw.budget ?? 0),
    dailyBudget: raw.dailyBudget != null ? Number(raw.dailyBudget) : null,
    durationDays: raw.durationDays != null ? Number(raw.durationDays) : null,
    estimatedSpentUsd: Number(raw.estimatedSpentUsd ?? 0),
    remainingBudgetUsd: Number(raw.remainingBudgetUsd ?? raw.budget ?? 0),
    isExpired: Boolean(raw.isExpired),
  };
}

export async function fetchMyActiveBoosts(opts: AuthOpts): Promise<ActiveBoost[]> {
  const res = await fetch(`${getApiBase()}/boost/my-active`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `My boosts failed (${res.status})`);
  return (Array.isArray(data.boosts) ? data.boosts : []).map(mapBoost);
}

export async function cancelBoost(
  boostId: number,
  opts: AuthOpts,
): Promise<{ refundUsd: number }> {
  const res = await fetch(`${getApiBase()}/boost/${boostId}/cancel`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Cancel failed (${res.status})`);
  return { refundUsd: Number(data.refundUsd ?? 0) };
}

export function daysLeft(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const ms = new Date(isoDate).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function estimateRefund(boost: ActiveBoost): number {
  if (!boost.boostExpiresAt || !boost.budget) return 0;
  const start = boost.boostStartAt ? new Date(boost.boostStartAt).getTime() : null;
  const expires = new Date(boost.boostExpiresAt).getTime();
  const now = Date.now();
  const totalMs = start ? expires - start : null;
  const remainingMs = Math.max(0, expires - now);
  if (!totalMs || totalMs <= 0) return 0;
  return parseFloat((boost.budget * (remainingMs / totalMs)).toFixed(2));
}

export type BoostAnalyticsOverview = {
  impressions: number;
  clicks: number;
  videoViews: number;
  spend: number;
  ctr: number | null;
  budget: number;
  status: string;
  title: string;
  thumbnail: string | null;
  plan: string | null;
  listingId: number | null;
};

export type BoostDailyPoint = {
  date: string;
  impressions: number;
  clicks?: number;
};

export type BoostAnalyticsDetail = {
  overview: BoostAnalyticsOverview;
  series: BoostDailyPoint[];
};

function metricNumber(raw: any): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return raw;
  if (typeof raw === "object" && raw.value != null) return Number(raw.value) || 0;
  return Number(raw) || 0;
}

export async function fetchBoostAnalytics(
  boostId: number,
  opts: AuthOpts,
): Promise<BoostAnalyticsDetail> {
  const res = await fetch(`${getApiBase()}/boost-analytics/${boostId}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Analytics failed (${res.status})`);
  const campaign = data.campaign ?? {};
  const overview = data.overview ?? {};
  const seriesRaw = Array.isArray(data.series) ? data.series : [];
  return {
    overview: {
      impressions: metricNumber(overview.impressions ?? campaign.impressions),
      clicks: metricNumber(overview.clicks ?? campaign.clicks),
      videoViews: metricNumber(overview.videoViews ?? campaign.videoViews),
      spend: metricNumber(overview.spend ?? overview.estimatedSpend),
      ctr:
        overview.ctr != null
          ? metricNumber(overview.ctr)
          : campaign.impressions
            ? Math.round((Number(campaign.clicks ?? 0) / Number(campaign.impressions)) * 1000) / 10
            : null,
      budget: Number(campaign.budget ?? campaign.price ?? 0),
      status: String(campaign.status ?? campaign.campaignStatus ?? ""),
      title: String(campaign.title ?? campaign.productTitle ?? ""),
      thumbnail: resolveBoostMediaUrl(campaign.thumbnail),
      plan: campaign.plan != null ? String(campaign.plan) : null,
      listingId: campaign.listingId != null ? Number(campaign.listingId) : null,
    },
    series: seriesRaw.map((p: any) => ({
      date: String(p.date ?? ""),
      impressions: Number(p.impressions ?? 0),
      clicks: p.clicks != null ? Number(p.clicks) : undefined,
    })),
  };
}
