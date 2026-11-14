import { getApiBase } from "./api";

export type PromoVideoItem = {
  id: number;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  title: string;
  sellerName?: string | null;
  boostEndAt?: string | null;
  createdAt?: string | null;
  boostStartAt?: string | null;
};

type FetchOpts = { token?: string | null };

export async function fetchHomePromoVideos(
  country: string,
  limit: number,
  opts: FetchOpts = {},
): Promise<PromoVideoItem[]> {
  const q = new URLSearchParams({
    page: "1",
    limit: String(limit),
    sort: "new",
    country,
  });
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${getApiBase()}/videos/feed?${q}`, { headers });
  if (!res.ok) throw new Error(`Promo videos failed (${res.status})`);
  const data = await res.json();
  return (data.videos ?? []) as PromoVideoItem[];
}
