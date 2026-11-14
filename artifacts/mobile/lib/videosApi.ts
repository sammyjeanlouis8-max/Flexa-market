import { getApiBase } from "./api";
import { resolveMediaUrl } from "./mediaUrl";

export type PromoVideo = {
  id: number;
  listingId?: number;
  title?: string | null;
  description?: string | null;
  videoUrl?: string | null;
  thumbnail?: string | null;
  thumbnailUrl?: string | null;
  posterUrl?: string | null;
  sellerId?: number | null;
  sellerName?: string | null;
  sellerAvatar?: string | null;
  price?: number | null;
  currency?: string | null;
  impressions?: number;
  clicks?: number;
  isVideoOnly?: boolean;
  isBoosted?: boolean;
  durationSec?: number | null;
};

export type RandomBoostAd = {
  id: number;
  title: string;
  price?: number | null;
  thumbnail: string | null;
  boostVideoUrl: string | null;
  boostImageUrl?: string | null;
  adFormat?: string | null;
  sellerName: string | null;
  sellerId?: number | null;
  boostCtaType: string | null;
  boostExternalLink: string | null;
  boostWhatsappNumber: string | null;
  boostCtaText: string | null;
  status?: string | null;
  isVideoOnly?: boolean;
};

type AuthOpts = { token?: string | null; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function normalizeVideo(raw: any): PromoVideo {
  const id = Number(raw.id);
  const videoUrl = resolveMediaUrl(raw.videoUrl || raw.boostVideoUrl) ?? raw.videoUrl ?? null;
  const thumb =
    resolveMediaUrl(raw.thumbnailUrl || raw.thumbnail || raw.posterUrl || raw.images?.[0]) ?? null;
  return {
    id,
    listingId: raw.listingId != null ? Number(raw.listingId) : id,
    title: raw.title ?? null,
    description: raw.description ?? null,
    videoUrl,
    thumbnail: thumb,
    thumbnailUrl: thumb,
    posterUrl: thumb,
    sellerId: raw.sellerId ?? null,
    sellerName: raw.sellerName ?? null,
    sellerAvatar: raw.sellerAvatar ?? null,
    price: raw.price ?? null,
    currency: raw.currency ?? null,
    impressions: raw.impressions ?? raw.viewCount ?? 0,
    clicks: raw.clicks ?? 0,
    isVideoOnly: !!raw.isVideoOnly || raw.status === "hidden",
    isBoosted: raw.isBoosted !== false,
    durationSec: raw.durationSec ?? raw.duration ?? null,
  };
}

export async function fetchVideosFeed(
  params: { country?: string; page?: number; limit?: number; sort?: string; q?: string } = {},
  opts: AuthOpts = {},
): Promise<{ videos: PromoVideo[]; hasMore: boolean; nextPage: number | null }> {
  const q = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 12),
  });
  if (params.country) q.set("country", params.country);
  if (params.sort) q.set("sort", params.sort);
  if (params.q) q.set("q", params.q);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(`${getApiBase()}/videos/feed?${q}`, {
    headers,
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Videos feed failed (${res.status})`);
  const videos = (Array.isArray(data.videos) ? data.videos : []).map(normalizeVideo);
  return {
    videos,
    hasMore: !!data.hasMore,
    nextPage: data.nextPage ?? null,
  };
}

export async function fetchRandomBoostAd(
  params: { country?: string } = {},
  opts: AuthOpts = {},
): Promise<RandomBoostAd | null> {
  const q = new URLSearchParams();
  if (params.country) q.set("country", params.country);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${getApiBase()}/boost/random-video?${q}`, {
    headers,
    signal: opts.signal,
  });
  if (res.status === 204 || res.status === 404) return null;
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Random boost failed (${res.status})`);
  const listing = data.listing || data;
  if (!listing?.id) return null;
  return {
    id: Number(listing.id),
    title: listing.title || "Sponsored",
    price: listing.price ?? null,
    thumbnail: resolveMediaUrl(listing.thumbnail) ?? listing.thumbnail ?? null,
    boostVideoUrl: resolveMediaUrl(listing.boostVideoUrl) ?? listing.boostVideoUrl ?? null,
    boostImageUrl: resolveMediaUrl(listing.boostImageUrl) ?? listing.boostImageUrl ?? null,
    adFormat: listing.adFormat ?? null,
    sellerName: listing.sellerName ?? null,
    sellerId: listing.sellerId ?? null,
    boostCtaType: listing.boostCtaType ?? null,
    boostExternalLink: listing.boostExternalLink ?? null,
    boostWhatsappNumber: listing.boostWhatsappNumber ?? null,
    boostCtaText: listing.boostCtaText ?? null,
    status: listing.status ?? null,
    isVideoOnly: !!listing.isVideoOnly || listing.status === "hidden",
  };
}

export async function trackVideoImpression(
  listingId: number,
  opts: AuthOpts = {},
): Promise<void> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  await fetch(`${getApiBase()}/videos/${listingId}/impression`, {
    method: "POST",
    headers,
    body: "{}",
    signal: opts.signal,
  }).catch(() => {});
}

export async function trackBoosterEvent(
  listingId: number,
  type: "view" | "click" | "skip" | "video_view",
  opts: AuthOpts = {},
): Promise<void> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  await fetch(`${getApiBase()}/booster/events`, {
    method: "POST",
    headers,
    body: JSON.stringify({ listingId, type }),
    signal: opts.signal,
  }).catch(() => {});
}

export function formatDuration(sec?: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
