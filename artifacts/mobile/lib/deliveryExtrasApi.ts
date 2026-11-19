/**
 * Driver tip + rating after physical delivery (not digital goods).
 */
import { getApiBase } from "./api";

type AuthOpts = { token: string; signal?: AbortSignal };

async function authed(
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

export async function tipDriver(
  deliveryId: number,
  body: { amount: number; message?: string; rating?: number },
  opts: AuthOpts,
): Promise<void> {
  const res = await authed(`/delivery/${deliveryId}/tip`, {
    ...opts,
    method: "POST",
    body,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Tip failed (${res.status})`);
}

export async function rateDriver(
  deliveryId: number,
  body: { rating: number; comment?: string; tags?: string[] },
  opts: AuthOpts,
): Promise<void> {
  const res = await authed(`/delivery/${deliveryId}/rate-driver`, {
    ...opts,
    method: "POST",
    body,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Rate failed (${res.status})`);
}

export async function fetchSellerReviews(
  sellerId: number,
  opts: { signal?: AbortSignal } = {},
): Promise<
  Array<{
    id: number;
    reviewerName: string;
    rating: number;
    comment: string | null;
    isVerifiedPurchase?: boolean;
    createdAt?: string;
  }>
> {
  const res = await fetch(`${getApiBase()}/users/${sellerId}/reviews`, {
    headers: { Accept: "application/json" },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Reviews failed (${res.status})`);
  return Array.isArray(data) ? data : Array.isArray(data.reviews) ? data.reviews : [];
}
