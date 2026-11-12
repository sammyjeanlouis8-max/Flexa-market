/**
 * Shared Flexa Market API helpers — DigitalOcean production ingress.
 * Never embeds secrets; JWT is passed by callers when needed.
 */
import { getBaseUrl as authBaseUrl } from "../context/AuthContext";

export function getApiBase(): string {
  return authBaseUrl();
}

export type Listing = {
  id: number;
  title: string;
  description?: string;
  price: number | string;
  currency?: string;
  images?: string[];
  city?: string | null;
  location?: string | null;
  country?: string | null;
  category?: string | null;
  condition?: string | null;
  status?: string | null;
  isBoosted?: boolean;
  favoriteCount?: number;
  viewCount?: number;
  sellerId?: number;
  sellerName?: string | null;
  sellerAvatar?: string | null;
  sellerIsVerified?: boolean;
  createdAt?: string;
  stockQuantity?: number | null;
  categorySlug?: string | null;
  moderationStatus?: string | null;
};

export type HomeStats = {
  totalListings: number;
  totalUsers: number;
  categoryCounts: { category: string; count: number }[];
  recentListings: Listing[];
  featuredListings: Listing[];
  flexaFamilyListings: Listing[];
};

export type ListingsPage = {
  listings: Listing[];
  total: number;
  page: number;
  totalPages: number;
};

type FetchOpts = {
  token?: string | null;
  signal?: AbortSignal;
};

async function apiFetch(path: string, opts: FetchOpts = {}) {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${getApiBase()}${path}`, {
    headers,
    signal: opts.signal,
  });
  return res;
}

export async function fetchHomeStats(
  country: string,
  opts: FetchOpts = {},
): Promise<HomeStats> {
  const q = new URLSearchParams({ country });
  const res = await apiFetch(`/stats/home?${q}`, opts);
  if (!res.ok) throw new Error(`Home stats failed (${res.status})`);
  return res.json();
}

export type PromoVideoHomeItem = {
  id: number;
  title?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  sellerName?: string | null;
  boostEndAt?: string | null;
};

/** Home promo strip — max two latest eligible feed videos (never full catalog). */
export async function fetchHomePromoVideos(
  country: string,
  opts: FetchOpts = {},
): Promise<PromoVideoHomeItem[]> {
  const q = new URLSearchParams({
    page: "1",
    limit: "2",
    sort: "all",
    country,
  });
  const res = await apiFetch(`/videos/feed?${q}`, opts);
  if (!res.ok) return [];
  const data = await res.json();
  const videos = Array.isArray(data?.videos) ? data.videos : [];
  return videos.slice(0, 2).map((v: Record<string, unknown>) => ({
    id: Number(v.id),
    title: (v.title as string) ?? null,
    videoUrl: (v.videoUrl as string) ?? null,
    thumbnailUrl: (v.thumbnailUrl as string) ?? null,
    sellerName: (v.sellerName as string) ?? null,
    boostEndAt: (v.boostEndAt as string) ?? null,
  }));
}

export async function fetchPromoVideosFeed(
  opts: FetchOpts & {
    country?: string;
    page?: number;
    limit?: number;
    selected?: number;
  } = {},
): Promise<{ videos: PromoVideoHomeItem[]; hasMore: boolean; nextPage: number | null }> {
  const q = new URLSearchParams({
    page: String(opts.page ?? 1),
    limit: String(Math.min(20, Math.max(1, opts.limit ?? 10))),
    sort: "all",
  });
  if (opts.country) q.set("country", opts.country);
  if (opts.selected && opts.selected > 0) q.set("selected", String(opts.selected));
  const res = await apiFetch(`/videos/feed?${q}`, opts);
  if (!res.ok) throw new Error(`Promo feed failed (${res.status})`);
  const data = await res.json();
  const videos = (Array.isArray(data?.videos) ? data.videos : []).map(
    (v: Record<string, unknown>) => ({
      id: Number(v.id),
      title: (v.title as string) ?? null,
      videoUrl: (v.videoUrl as string) ?? null,
      thumbnailUrl: (v.thumbnailUrl as string) ?? null,
      sellerName: (v.sellerName as string) ?? null,
      boostEndAt: (v.boostEndAt as string) ?? null,
    }),
  );
  return {
    videos,
    hasMore: !!data?.hasMore,
    nextPage: data?.nextPage ?? null,
  };
}

export async function fetchListings(
  params: {
    country: string;
    q?: string;
    page?: number;
    limit?: number;
    category?: string;
  },
  opts: FetchOpts = {},
): Promise<ListingsPage> {
  const q = new URLSearchParams({
    country: params.country,
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 20),
  });
  if (params.q) q.set("q", params.q);
  if (params.category) q.set("category", params.category);
  const res = await apiFetch(`/listings?${q}`, opts);
  if (!res.ok) throw new Error(`Listings failed (${res.status})`);
  return res.json();
}

export async function fetchListing(
  id: number | string,
  opts: FetchOpts = {},
): Promise<Listing> {
  const res = await apiFetch(`/listings/${id}`, opts);
  if (!res.ok) throw new Error(`Listing ${id} failed (${res.status})`);
  return res.json();
}

export async function fetchCategories(opts: FetchOpts = {}) {
  const res = await apiFetch(`/categories`, opts);
  if (!res.ok) throw new Error(`Categories failed (${res.status})`);
  return res.json();
}
