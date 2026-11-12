import { getApiBase } from "./api";

export type ManagerMe = {
  seller: {
    id: number;
    name: string;
    avatar?: string | null;
    location?: string | null;
    phone?: string | null;
  } | null;
};

export type ManagerOrder = {
  id: number;
  orderStatus: string;
  paymentMethod?: string | null;
  amount: number;
  createdAt: string;
  shippingName?: string | null;
  shippingPhone?: string | null;
  shippingCity?: string | null;
  listing?: { id: number; title: string; image: string | null } | null;
  buyer?: { id: number; name: string; phone?: string | null } | null;
  packageReady?: boolean;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchManagerMe(opts: AuthOpts): Promise<ManagerMe> {
  const res = await fetch(`${getApiBase()}/manager/me`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Manager me failed (${res.status})`);
  return data as ManagerMe;
}

export async function fetchManagerOrders(
  opts: AuthOpts,
  page = 1,
): Promise<{ orders: ManagerOrder[]; hasMore: boolean }> {
  const res = await fetch(`${getApiBase()}/manager/orders?page=${page}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Manager orders failed (${res.status})`);
  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    hasMore: !!data.hasMore,
  };
}

export async function markManagerOrderReady(
  orderId: number,
  opts: AuthOpts,
): Promise<void> {
  const res = await fetch(`${getApiBase()}/manager/orders/${orderId}/ready`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Mark ready failed (${res.status})`);
}
