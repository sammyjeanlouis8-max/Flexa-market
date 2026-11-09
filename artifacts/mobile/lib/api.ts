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
