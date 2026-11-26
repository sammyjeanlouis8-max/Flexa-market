/**
 * Promo video discover feed — GET /api/videos/feed
 */
import { getApiBase } from "./api";

export type DiscoverSort = "all" | "trending" | "new" | "mine";

export type DiscoverVideo = {
  id: number;
  videoUrl: string;
  thumbnailUrl: string | null;
  title: string;
  description: string;
  price: number;
  currency: string | null;
  country?: string | null;
  sellerId: number | null;
  sellerName: string;
  sellerAvatar: string | null;
  sellerIsVerified: boolean;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  isVideoOnly: boolean;
  boostEndAt: string | null;
  boostStartAt: string | null;
};

export type VideoFeedPage = {
  videos: DiscoverVideo[];
  hasMore: boolean;
  total: number | null;
  page: number;
};

type FeedOpts = {
  token?: string | null;
  signal?: AbortSignal;
  page?: number;
  limit?: number;
  sort?: DiscoverSort;
  seed?: number;
  q?: string;
  country?: string | null;
  allCountries?: boolean;
};

function mediaOrigin(): string {
  return getApiBase().replace(/\/api\/?$/, "");
}

export function resolveMediaUrl(raw: string | null | undefined): string | null {
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

/** Public Discover tabs only keep live boosts (boostEndAt > now OR null). */
export function isLiveBoost(v: { boostEndAt: string | null }): boolean {
  if (!v.boostEndAt) return true;
  const t = new Date(v.boostEndAt).getTime();
  if (Number.isNaN(t)) return true;
  return t > Date.now();
}

function mapVideo(raw: any): DiscoverVideo {
  return {
    id: Number(raw.id),
    videoUrl: resolveMediaUrl(raw.videoUrl) ?? String(raw.videoUrl ?? ""),
    thumbnailUrl: resolveMediaUrl(raw.thumbnailUrl ?? raw.thumbnail ?? null),
    title: String(raw.title ?? ""),
    description: String(raw.description ?? ""),
    price: Number(raw.price ?? 0),
    currency: raw.currency ?? null,
    country: raw.country ?? null,
    sellerId: raw.sellerId != null ? Number(raw.sellerId) : null,
    sellerName: String(raw.sellerName ?? "Seller"),
    sellerAvatar: resolveMediaUrl(raw.sellerAvatar),
    sellerIsVerified: Boolean(raw.sellerIsVerified),
    viewCount: Number(raw.viewCount ?? 0),
    likeCount: Number(raw.likeCount ?? 0),
    commentCount: Number(raw.commentCount ?? 0),
    isVideoOnly: Boolean(raw.isVideoOnly),
    boostEndAt: raw.boostEndAt ?? null,
    boostStartAt: raw.boostStartAt ?? null,
  };
}

export async function fetchVideoFeed(opts: FeedOpts = {}): Promise<VideoFeedPage> {
  const sort: DiscoverSort = opts.sort ?? "all";
  const page = Math.max(1, opts.page ?? 1);
  const params = new URLSearchParams({
    page: String(page),
    limit: String(opts.limit ?? 12),
    seed: String(opts.seed && opts.seed > 0 ? opts.seed : 1),
    sort,
  });
  if (opts.q?.trim()) params.set("q", opts.q.trim());
  if (opts.country) params.set("country", opts.country);
  if (opts.allCountries) params.set("allCountries", "1");

  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(`${getApiBase()}/videos/feed?${params}`, {
    headers,
    signal: opts.signal,
  });
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) throw new Error(data.error || `Video feed failed (${res.status})`);

  const incoming: DiscoverVideo[] = (Array.isArray(data.videos) ? data.videos : [])
    .map(mapVideo)
    .filter((v: DiscoverVideo) => (sort === "mine" ? true : isLiveBoost(v)));

  const serverTotal =
    typeof data.total === "number" && Number.isFinite(data.total)
      ? Math.max(0, data.total)
      : null;

  return {
    videos: incoming,
    hasMore: Boolean(data.hasMore),
    total: serverTotal,
    page,
  };
}

export function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatPrice(price: number, currency?: string | null): string {
  if (!Number.isFinite(price) || price <= 0) return "";
  const c = (currency || "USD").toUpperCase();
  if (c === "HTG") return `${Math.round(price).toLocaleString()} HTG`;
  if (c === "DOP") return `RD$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
