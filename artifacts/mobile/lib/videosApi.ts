/**
 * Promotional video feed APIs — GET /api/videos/feed + analytics posts.
 */
import { getApiBase } from "./api";

export type PromoVideo = {
  id: number;
  videoUrl: string;
  thumbnailUrl?: string | null;
  title: string;
  description?: string | null;
  price?: number | string;
  currency?: string | null;
  country?: string | null;
  stockQuantity?: number | null;
  isVideoOnly?: boolean;
  sellerId?: number;
  sellerName?: string | null;
  sellerAvatar?: string | null;
  sellerIsVerified?: boolean;
  sellerWhatsapp?: string | null;
  sellerPhone?: string | null;
  viewCount?: number;
  likeCount?: number;
  saveCount?: number;
  isSaved?: boolean;
  sharesCount?: number;
  commentCount?: number;
  isBoosted?: boolean;
  boostStartAt?: string | null;
  boostEndAt?: string | null;
  createdAt?: string | null;
};

export type VideosFeedPage = {
  videos: PromoVideo[];
  hasMore?: boolean;
  nextPage?: number | null;
  noCountry?: boolean;
  viewingCountry?: string | null;
  sort?: string;
};

type FetchOpts = {
  token?: string | null;
  signal?: AbortSignal;
};

function authHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function fetchVideosFeed(
  params: {
    page?: number;
    limit?: number;
    seed?: number;
    sort?: "all" | "trending" | "new" | "mine";
    q?: string;
    exclude?: number[];
    selected?: number;
    country?: string;
    allCountries?: boolean;
  } = {},
  opts: FetchOpts = {},
): Promise<VideosFeedPage> {
  const q = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 10),
  });
  if (params.seed != null) q.set("seed", String(params.seed));
  if (params.sort) q.set("sort", params.sort);
  if (params.q) q.set("q", params.q.slice(0, 80));
  if (params.exclude?.length) q.set("exclude", params.exclude.join(","));
  if (params.selected) q.set("selected", String(params.selected));
  if (params.allCountries) q.set("allCountries", "1");
  else if (params.country) q.set("country", params.country);

  const res = await fetch(`${getApiBase()}/videos/feed?${q}`, {
    headers: authHeaders(opts.token),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`Videos feed failed (${res.status})`);
  const data = await res.json();
  return {
    videos: Array.isArray(data.videos) ? data.videos : [],
    hasMore: !!data.hasMore,
    nextPage: data.nextPage ?? null,
    noCountry: !!data.noCountry,
    viewingCountry: data.viewingCountry ?? null,
    sort: data.sort,
  };
}

/** Home strip: newest eligible boosted videos (client keeps 2). */
export async function fetchHomePromoVideos(
  country: string,
  opts: FetchOpts = {},
): Promise<PromoVideo[]> {
  const page = await fetchVideosFeed(
    { page: 1, limit: 6, sort: "new", country },
    opts,
  );
  const now = Date.now();
  return (page.videos ?? [])
    .filter((v) => {
      if (!v.videoUrl) return false;
      if (!v.boostEndAt) return true;
      return new Date(v.boostEndAt).getTime() > now;
    })
    .slice(0, 2);
}

export async function postVideoImpression(
  id: number,
  body: { source?: string; viewerKey?: string; country?: string; device?: string } = {},
  opts: FetchOpts = {},
): Promise<void> {
  await fetch(`${getApiBase()}/videos/${id}/impression`, {
    method: "POST",
    headers: {
      ...authHeaders(opts.token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  }).catch(() => {});
}

export async function postVideoBuyClick(
  id: number,
  body: { source?: string; viewerKey?: string; country?: string; device?: string } = {},
  opts: FetchOpts = {},
): Promise<void> {
  await fetch(`${getApiBase()}/videos/${id}/buy-click`, {
    method: "POST",
    headers: {
      ...authHeaders(opts.token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  }).catch(() => {});
}
