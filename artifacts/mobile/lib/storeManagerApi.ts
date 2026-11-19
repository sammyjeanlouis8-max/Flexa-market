/**
 * Store manager invite + manager dashboard APIs.
 */
import { getApiBase } from "./api";

type AuthOpts = { token: string };

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
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export type StoreManager = {
  id: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
} | null;

export async function fetchSellerManager(opts: AuthOpts): Promise<StoreManager> {
  const res = await authed("/seller/manager", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Manager fetch failed (${res.status})`);
  return (data.manager ?? null) as StoreManager;
}

export async function inviteStoreManager(
  identifier: string,
  opts: AuthOpts,
): Promise<StoreManager> {
  const res = await authed("/seller/manager/invite", {
    ...opts,
    method: "POST",
    body: { identifier: identifier.trim() },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Invite failed (${res.status})`);
  return (data.manager ?? null) as StoreManager;
}

export async function removeStoreManager(opts: AuthOpts): Promise<void> {
  const res = await authed("/seller/manager", { ...opts, method: "DELETE" });
  if (res.ok || res.status === 204) return;
  const data = await readJson(res);
  throw new Error(data.error || `Remove failed (${res.status})`);
}

export async function fetchManagerMe(
  opts: AuthOpts,
): Promise<{ seller: { id: number; name?: string | null } } | null> {
  const res = await authed("/manager/me", opts);
  if (res.status === 403) return null;
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Manager me failed (${res.status})`);
  return data;
}

export type ManagerOrder = {
  id: number;
  listingTitle?: string;
  orderStatus?: string;
  buyerName?: string | null;
  amount?: number;
  createdAt?: string;
  [key: string]: unknown;
};

export async function fetchManagerOrders(
  opts: AuthOpts & { page?: number },
): Promise<{ orders: ManagerOrder[]; page: number; hasMore: boolean }> {
  const page = opts.page ?? 1;
  const res = await authed(`/manager/orders?page=${page}`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Manager orders failed (${res.status})`);
  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    page: Number(data.page ?? page),
    hasMore: Boolean(data.hasMore),
  };
}

export async function markManagerOrderReady(
  orderId: number,
  opts: AuthOpts,
): Promise<void> {
  const res = await authed(`/manager/orders/${orderId}/ready`, {
    ...opts,
    method: "POST",
    body: {},
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Ready failed (${res.status})`);
}
