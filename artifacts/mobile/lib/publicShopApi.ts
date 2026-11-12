/**
 * Public seller shop + guest tracking helpers.
 */
import { getApiBase, type Listing } from "./api";

type FetchOpts = { token?: string | null; signal?: AbortSignal };

async function apiFetch(path: string, opts: FetchOpts = {}) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  return fetch(`${getApiBase()}${path}`, { headers, signal: opts.signal });
}

export type PublicUser = {
  id: number;
  name: string;
  avatar?: string | null;
  bio?: string | null;
  country?: string | null;
  location?: string | null;
  isVerified?: boolean;
  followerCount?: number;
  followingCount?: number;
  listingCount?: number;
  rating?: number | null;
  reviewCount?: number | null;
  isFollowing?: boolean;
  totalSales?: number;
};

export type SellerReview = {
  id: number;
  reviewerName: string;
  reviewerAvatar?: string | null;
  rating: number;
  comment?: string | null;
  isVerifiedPurchase?: boolean;
  createdAt?: string;
};

export async function fetchPublicUser(
  id: number | string,
  opts: FetchOpts = {},
): Promise<PublicUser> {
  const res = await apiFetch(`/users/${id}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `User ${id} failed (${res.status})`);
  return data as PublicUser;
}

export async function fetchUserListings(
  id: number | string,
  opts: FetchOpts = {},
): Promise<Listing[]> {
  const res = await apiFetch(`/users/${id}/listings`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Listings failed (${res.status})`);
  return Array.isArray(data) ? data : [];
}

export async function fetchSellerReviews(
  id: number | string,
  opts: FetchOpts = {},
): Promise<SellerReview[]> {
  const res = await apiFetch(`/users/${id}/reviews`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Reviews failed (${res.status})`);
  return Array.isArray(data) ? data : [];
}

export type PublicTracking = {
  delivery: {
    id: number;
    trackingNumber?: string;
    status?: string | null;
    deliveryCity?: string | null;
    pickupCity?: string | null;
    country?: string | null;
    createdAt?: string;
    acceptedAt?: string | null;
    pickedUpAt?: string | null;
    deliveredAt?: string | null;
    driverFirstName?: string | null;
    driverVehicleType?: string | null;
    estimatedMinutes?: number | null;
  };
};

export async function fetchPublicTracking(
  trackingNumber: string,
  opts: FetchOpts = {},
): Promise<PublicTracking> {
  const tn = trackingNumber.trim().toUpperCase();
  const res = await apiFetch(`/track/${encodeURIComponent(tn)}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Tracking failed (${res.status})`);
  return data as PublicTracking;
}
