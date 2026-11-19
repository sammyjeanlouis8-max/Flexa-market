/**
 * Seller listings — create / update / delete / my listings.
 */
import { getApiBase, type Listing } from "./api";

export type CategoryNode = {
  id: number;
  name: string;
  slug: string;
  icon?: string | null;
  children?: CategoryNode[];
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
  images: string[];
  stockQuantity?: number | null;
  deliveryMethod?: "motorcycle" | "car" | "bus" | "self_delivery" | null;
};

export type SellerListing = Listing & {
  moderationStatus?: string | null;
  moderationReason?: string | null;
  lifecycleStatus?: string | null;
  categorySlug?: string | null;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function authed(
  path: string,
  opts: AuthOpts & { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${opts.token}`,
    ...(opts.headers || {}),
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

export async function fetchSellerListings(
  userId: number,
  opts: AuthOpts,
): Promise<SellerListing[]> {
  const res = await authed(`/users/${userId}/listings`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `My listings failed (${res.status})`);
  return Array.isArray(data) ? data : [];
}

export async function createListing(
  input: CreateListingInput,
  opts: AuthOpts & { idempotencyKey?: string },
): Promise<SellerListing> {
  const headers: Record<string, string> = {};
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const res = await authed("/listings", {
    ...opts,
    method: "POST",
    body: input,
    headers,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Create listing failed (${res.status})`);
  return data as SellerListing;
}

export async function updateListing(
  id: number | string,
  input: Partial<CreateListingInput> & { status?: string },
  opts: AuthOpts,
): Promise<SellerListing> {
  const res = await authed(`/listings/${id}`, {
    ...opts,
    method: "PUT",
    body: input,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Update listing failed (${res.status})`);
  return data as SellerListing;
}

export async function deleteListing(id: number | string, opts: AuthOpts): Promise<void> {
  const res = await authed(`/listings/${id}`, { ...opts, method: "DELETE" });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Delete listing failed (${res.status})`);
}

export async function markListingSold(id: number | string, opts: AuthOpts): Promise<SellerListing> {
  const res = await authed(`/listings/${id}/mark-sold`, { ...opts, method: "POST", body: {} });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Mark sold failed (${res.status})`);
  return data as SellerListing;
}

export function isDraftListing(l: SellerListing): boolean {
  const mod = (l.moderationStatus || "").toLowerCase();
  const life = (l.lifecycleStatus || "").toLowerCase();
  const status = (l.status || "").toLowerCase();
  if (mod === "pending" || mod === "rejected") return true;
  if (["pending_review", "draft", "suspended"].includes(life)) return true;
  if (status === "removed") return true;
  return false;
}
