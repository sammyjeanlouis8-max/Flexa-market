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
