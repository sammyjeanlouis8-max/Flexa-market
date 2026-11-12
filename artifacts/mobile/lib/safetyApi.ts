/**
 * Hide products, block users, and report abuse — shared DigitalOcean APIs.
 */
import { getApiBase } from "./api";

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

export async function hideListing(listingId: number, opts: AuthOpts): Promise<void> {
  const res = await authedFetch(`/listings/${listingId}/hide`, { ...opts, method: "POST", body: {} });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Hide failed (${res.status})`);
}

export async function unhideListing(listingId: number, opts: AuthOpts): Promise<void> {
  const res = await authedFetch(`/listings/${listingId}/hide`, { ...opts, method: "DELETE" });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Unhide failed (${res.status})`);
}

export async function hideSellerListings(sellerId: number, opts: AuthOpts): Promise<void> {
  const res = await authedFetch(`/users/${sellerId}/hide-listings`, { ...opts, method: "POST", body: {} });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Hide seller failed (${res.status})`);
}

export async function unhideSellerListings(sellerId: number, opts: AuthOpts): Promise<void> {
  const res = await authedFetch(`/users/${sellerId}/hide-listings`, { ...opts, method: "DELETE" });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Unhide seller failed (${res.status})`);
}

export async function fetchMyHides(opts: AuthOpts): Promise<{
  listings: Array<{
    id: number;
    listingId: number;
    title: string;
    image: string | null;
    sellerId: number;
    sellerName: string | null;
    createdAt: string;
  }>;
  sellers: Array<{
    id: number;
    sellerId: number;
    sellerName: string;
    sellerAvatar: string | null;
    createdAt: string;
  }>;
}> {
  const res = await authedFetch("/users/me/hides", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Hides failed (${res.status})`);
  return {
    listings: Array.isArray(data.listings) ? data.listings : [],
    sellers: Array.isArray(data.sellers) ? data.sellers : [],
  };
}

export async function fetchMyBlocks(opts: AuthOpts): Promise<
  Array<{ id: number; name: string; avatar: string | null; blockedAt: string | null }>
> {
  const res = await authedFetch("/users/me/blocks", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Blocks failed (${res.status})`);
  return Array.isArray(data.blocks) ? data.blocks : [];
}

export async function blockUser(
  userId: number,
  opts: AuthOpts & { report?: boolean; reason?: string },
): Promise<{ blocked: boolean; reportId: number | null }> {
  const res = await authedFetch(`/users/${userId}/block`, {
    token: opts.token,
    signal: opts.signal,
    method: "POST",
    body: { report: opts.report === true, reason: opts.reason },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Block failed (${res.status})`);
  return { blocked: true, reportId: data.reportId ?? null };
}

export async function unblockUser(userId: number, opts: AuthOpts): Promise<void> {
  const res = await authedFetch(`/users/${userId}/block`, { ...opts, method: "DELETE" });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Unblock failed (${res.status})`);
}

export async function submitAbuseReport(
  body: { targetType: "user" | "listing"; targetId: number; reason: string },
  opts: AuthOpts,
): Promise<{ reportId?: number; duplicate?: boolean }> {
  const res = await authedFetch("/reports", { ...opts, method: "POST", body });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Report failed (${res.status})`);
  return data;
}

export const ABUSE_REASONS = [
  { key: "harassment", label: "Harassment" },
  { key: "threats", label: "Threats" },
  { key: "fraud", label: "Fraud / scam" },
  { key: "other", label: "Other" },
] as const;
