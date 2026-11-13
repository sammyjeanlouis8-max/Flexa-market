import { getApiBase } from "./api";

export type SellerAnalytics = {
  range: string;
  from: string;
  to: string;
  overview: {
    views: number;
    organicViews: number;
    sponsoredViews: number;
    clicks: number;
    sales: number;
    revenue: number;
    ctr: number;
    favorites: number;
  };
  channels: {
    listings: { views: number; clicks: number; sales: number };
    boosts: {
      views: number;
      clicks: number;
      sales: number;
      activeCampaigns: number;
      adSpend: number;
      remainingBudget: number;
    };
  };
  listings: Array<{
    id: number;
    title: string;
    status: string;
    price: number;
    views: number;
    thumbnail: string | null;
    isBoosted: boolean;
    hasVideo: boolean;
  }>;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchSellerAnalytics(
  opts: AuthOpts,
  range: string = "7d",
): Promise<SellerAnalytics> {
  const res = await fetch(`${getApiBase()}/seller/analytics?range=${encodeURIComponent(range)}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Seller analytics failed (${res.status})`);
  return data as SellerAnalytics;
}
