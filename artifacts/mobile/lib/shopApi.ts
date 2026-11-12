import { getApiBase, type Listing } from "./api";

export type PublicShop = {
  id: number;
  name: string;
  avatar?: string | null;
  bio?: string | null;
  country?: string | null;
  location?: string | null;
  rating?: number;
  reviewCount?: number;
  isVerified?: boolean;
  followerCount?: number;
  followingCount?: number;
  listingCount?: number;
  subscriptionPlan?: string | null;
  isFollowing?: boolean;
  totalSales?: number;
};

type AuthOpts = { token?: string | null; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function headers(opts: AuthOpts): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (opts.token) h.Authorization = `Bearer ${opts.token}`;
  return h;
}

export async function fetchShopProfile(
  userId: number | string,
  opts: AuthOpts = {},
): Promise<PublicShop> {
  const res = await fetch(`${getApiBase()}/users/${userId}`, {
    headers: headers(opts),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Shop profile failed (${res.status})`);
  return data as PublicShop;
}

export async function fetchShopListings(
  userId: number | string,
  opts: AuthOpts = {},
): Promise<Listing[]> {
  const res = await fetch(`${getApiBase()}/users/${userId}/listings`, {
    headers: headers(opts),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Shop listings failed (${res.status})`);
  return Array.isArray(data) ? data : [];
}

export async function followShop(userId: number | string, opts: { token: string }): Promise<void> {
  const res = await fetch(`${getApiBase()}/users/${userId}/follow`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Follow failed (${res.status})`);
}

export async function unfollowShop(userId: number | string, opts: { token: string }): Promise<void> {
  const res = await fetch(`${getApiBase()}/users/${userId}/follow`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Unfollow failed (${res.status})`);
}
