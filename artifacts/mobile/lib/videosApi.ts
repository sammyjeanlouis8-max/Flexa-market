import { getApiBase } from "./api";

export type PromoVideo = {
  id: number;
  listingId?: number;
  title?: string | null;
  description?: string | null;
  videoUrl?: string | null;
  thumbnail?: string | null;
  posterUrl?: string | null;
  sellerId?: number | null;
  sellerName?: string | null;
  sellerAvatar?: string | null;
  price?: number | null;
  currency?: string | null;
  impressions?: number;
  clicks?: number;
};

type AuthOpts = { token?: string | null; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
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
  return {
    videos: Array.isArray(data.videos) ? data.videos : [],
    hasMore: !!data.hasMore,
    nextPage: data.nextPage ?? null,
  };
}
