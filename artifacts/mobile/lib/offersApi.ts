import { getApiBase } from "./api";

export type Offer = {
  id: number;
  listingId: number;
  buyerId: number;
  sellerId: number;
  amount: number;
  message?: string | null;
  status: string;
  counterAmount?: number | null;
  counterMessage?: string | null;
  listingTitle?: string | null;
  listingImage?: string | null;
  buyerName?: string | null;
  sellerName?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

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

export async function fetchOffers(
  opts: AuthOpts,
): Promise<{ sent: Offer[]; received: Offer[] }> {
  const res = await authed("/offers", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Offers failed (${res.status})`);
  return {
    sent: Array.isArray(data.sent) ? data.sent : [],
    received: Array.isArray(data.received) ? data.received : [],
  };
}

export async function acceptOffer(id: number, opts: AuthOpts): Promise<Offer> {
  const res = await authed(`/offers/${id}/accept`, { ...opts, method: "POST", body: {} });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Accept failed (${res.status})`);
  return data as Offer;
}

export async function rejectOffer(id: number, opts: AuthOpts): Promise<Offer> {
  const res = await authed(`/offers/${id}/reject`, { ...opts, method: "POST", body: {} });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Reject failed (${res.status})`);
  return data as Offer;
}

export async function counterOffer(
  id: number,
  counterAmount: number,
  counterMessage: string | undefined,
  opts: AuthOpts,
): Promise<Offer> {
  const res = await authed(`/offers/${id}/counter`, {
    ...opts,
    method: "POST",
    body: { counterAmount, counterMessage },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Counter failed (${res.status})`);
  return data as Offer;
}

export async function acceptCounter(id: number, opts: AuthOpts): Promise<Offer> {
  const res = await authed(`/offers/${id}/accept-counter`, {
    ...opts,
    method: "POST",
    body: {},
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Accept counter failed (${res.status})`);
  return data as Offer;
}
