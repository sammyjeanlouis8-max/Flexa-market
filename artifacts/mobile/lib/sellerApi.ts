/**
 * Seller Center APIs — listings, sales dashboard, orders/sales, categories.
 */
import { getApiBase } from "./api";
import type { Listing } from "./api";

export type Category = {
  id: number;
  name: string;
  slug?: string;
  parentId?: number | null;
  children?: Category[];
};

export type CreateListingInput = {
  title: string;
  description: string;
  price: number;
  currency?: "USD" | "HTG" | "DOP";
  categoryId: number;
  subcategoryId?: number | null;
  condition: "new" | "like_new" | "good" | "fair" | "poor";
  location: string;
  city?: string;
  state?: string;
  country?: string;
  stockQuantity?: number | null;
  itemSize?: string | null;
  images: string[];
  listingVideoUrl?: string | null;
  deliveryMethod?: "motorcycle" | "car" | "bus" | "self_delivery";
};

export type SellerSaleOrder = {
  id: number;
  listingId?: number | null;
  listingTitle?: string;
  listingImages?: string[] | null;
  amount?: number;
  currency?: string;
  buyerName?: string | null;
  orderStatus?: string | null;
  paymentStatus?: string | null;
  deliveryStatus?: string | null;
  createdAt?: string;
  sellerEarnings?: number | null;
  [key: string]: unknown;
};

export type SalesDashboard = {
  totalSales?: number;
  totalOrders?: number;
  pendingOrders?: number;
  completedOrders?: number;
  totalEarnings?: number;
  currency?: string;
  recentOrders?: SellerSaleOrder[];
  [key: string]: unknown;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function authedFetch(
  path: string,
  opts: AuthOpts & { method?: string; body?: unknown },
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${opts.token}`,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchCategories(opts: AuthOpts = { token: "" }): Promise<Category[]> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${getApiBase()}/categories`, {
    headers,
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Categories failed (${res.status})`);
  return Array.isArray(data) ? data : [];
}

export async function fetchUserListings(
  userId: number,
  opts: AuthOpts,
): Promise<Listing[]> {
  const res = await authedFetch(`/users/${userId}/listings`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Listings failed (${res.status})`);
  return Array.isArray(data) ? data : [];
}

export async function createListing(
  input: CreateListingInput,
  opts: AuthOpts,
): Promise<Listing> {
  if (!input.images?.length) {
    throw new Error("At least one product image is required");
  }
  const res = await authedFetch("/listings", {
    ...opts,
    method: "POST",
    body: input,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Create listing failed (${res.status})`);
  return data as Listing;
}

export async function updateListing(
  id: number,
  input: Partial<CreateListingInput>,
  opts: AuthOpts,
): Promise<Listing> {
  if (input.images && input.images.length === 0) {
    throw new Error("At least one product image is required");
  }
  const res = await authedFetch(`/listings/${id}`, {
    ...opts,
    method: "PUT",
    body: input,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Update listing failed (${res.status})`);
  return data as Listing;
}

export async function deleteListing(id: number, opts: AuthOpts): Promise<void> {
  const res = await authedFetch(`/listings/${id}`, { ...opts, method: "DELETE" });
  if (res.ok || res.status === 204) return;
  const data = await readJson(res);
  throw new Error(data.error || `Delete failed (${res.status})`);
}

export async function fetchSalesDashboard(opts: AuthOpts): Promise<SalesDashboard> {
  const res = await authedFetch("/sales/dashboard", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Sales dashboard failed (${res.status})`);
  return data as SalesDashboard;
}

export async function fetchSellerOrders(opts: AuthOpts): Promise<SellerSaleOrder[]> {
  const res = await authedFetch("/orders/sales", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Seller orders failed (${res.status})`);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.orders)) return data.orders;
  if (Array.isArray(data.sales)) return data.sales;
  return [];
}

export async function restockListing(
  id: number,
  add: number,
  opts: AuthOpts,
): Promise<{ ok: boolean; stockQuantity?: number; status?: string }> {
  const res = await authedFetch(`/listings/${id}/restock`, {
    ...opts,
    method: "PATCH",
    body: { add },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Restock failed (${res.status})`);
  return data;
}

export type SalesSummary = {
  orderCount: number;
  totalSales: number;
  totalCommission: number;
  netEarnings: number;
};

export async function fetchSalesSummary(opts: AuthOpts): Promise<SalesSummary> {
  const res = await authedFetch("/sales/summary", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Sales summary failed (${res.status})`);
  return {
    orderCount: Number(data.orderCount ?? 0),
    totalSales: Number(data.totalSales ?? 0),
    totalCommission: Number(data.totalCommission ?? 0),
    netEarnings: Number(data.netEarnings ?? 0),
  };
}

export type SellerAnalytics = {
  overview?: {
    views?: number;
    organicViews?: number;
    sponsoredViews?: number;
    clicks?: number;
    sales?: number;
    revenue?: number;
    ctr?: number;
    favorites?: number;
  };
  listings?: Array<{
    id: number;
    title?: string;
    viewCount?: number;
    status?: string;
    price?: number;
  }>;
  boosts?: unknown[];
  range?: string;
  [key: string]: unknown;
};

export async function fetchSellerAnalytics(
  range: "today" | "7d" | "30d" | "90d" = "30d",
  opts: AuthOpts,
): Promise<SellerAnalytics> {
  const res = await authedFetch(`/seller/analytics?range=${range}`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Analytics failed (${res.status})`);
  return data as SellerAnalytics;
}

export type PayoutAccount = {
  moncashNumber?: string | null;
  moncashVerified?: boolean;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankVerified?: boolean;
  cardPayoutMethod?: "fm_wallet" | "stripe" | string | null;
  [key: string]: unknown;
} | null;

export async function fetchPayoutAccount(opts: AuthOpts): Promise<PayoutAccount> {
  const res = await authedFetch("/seller/payout-account", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Payout account failed (${res.status})`);
  return data ?? null;
}

export async function saveMoncashPayout(
  moncashNumber: string,
  opts: AuthOpts,
): Promise<PayoutAccount> {
  const res = await authedFetch("/seller/payout-account/moncash", {
    ...opts,
    method: "PUT",
    body: { moncashNumber },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `MonCash save failed (${res.status})`);
  return data;
}

export async function saveBankPayout(
  input: { bankName: string; bankAccountName: string; bankAccountNumber: string },
  opts: AuthOpts,
): Promise<PayoutAccount> {
  const res = await authedFetch("/seller/payout-account/bank", {
    ...opts,
    method: "PUT",
    body: input,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Bank save failed (${res.status})`);
  return data;
}

export async function setCardPayoutMethod(
  method: "fm_wallet" | "stripe",
  opts: AuthOpts,
): Promise<PayoutAccount> {
  const res = await authedFetch("/seller/payout-account/card-method", {
    ...opts,
    method: "PATCH",
    body: { method },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Card method failed (${res.status})`);
  return data;
}

export type BoostCampaign = {
  id: number;
  listingId?: number;
  plan?: string;
  status?: string;
  paymentStatus?: string;
  budget?: number;
  impressions?: number;
  clicks?: number;
  expiresAt?: string | null;
  createdAt?: string;
  title?: string;
  [key: string]: unknown;
};

export async function fetchMyBoosts(opts: AuthOpts): Promise<BoostCampaign[]> {
  const res = await authedFetch("/boost/my-active", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Boosts failed (${res.status})`);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.boosts)) return data.boosts;
  return [];
}

export async function fetchBoosterCampaigns(opts: AuthOpts): Promise<BoostCampaign[]> {
  const res = await authedFetch("/booster/campaigns", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Campaigns failed (${res.status})`);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.campaigns)) return data.campaigns;
  return [];
}

export type VideoFeedItem = {
  id: number;
  videoUrl?: string | null;
  title?: string | null;
  listingId?: number | null;
  [key: string]: unknown;
};

export async function fetchVideosFeed(
  opts: AuthOpts & { sort?: string; page?: number } = { token: "" },
): Promise<VideoFeedItem[]> {
  const q = new URLSearchParams({
    page: String(opts.page ?? 1),
    limit: "20",
    sort: opts.sort ?? "mine",
  });
  const res = await authedFetch(`/videos/feed?${q}`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Videos failed (${res.status})`);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.videos)) return data.videos;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

export function validateListingDraft(input: Partial<CreateListingInput>): string | null {
  if (!input.title?.trim() || input.title.trim().length < 3) return "Title must be at least 3 characters";
  if (!input.description?.trim() || input.description.trim().length < 10) {
    return "Description must be at least 10 characters";
  }
  if (input.price == null || !(Number(input.price) > 0)) return "Enter a valid price";
  if (!input.categoryId) return "Select a category";
  if (!input.condition) return "Select condition";
  if (!input.location?.trim()) return "Location is required";
  if (!input.images?.length) return "Add at least one product image";
  return null;
}
