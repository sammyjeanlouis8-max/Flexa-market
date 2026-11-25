/**
 * Native Flexa Wholesale API client — same Market JWT session as the rest of the app.
 * No WebView. Chat-only wholesale (no cart / checkout).
 */
import { getApiBase } from "./api";

export type WholesaleTier = {
  id?: number;
  minQuantity: number;
  maxQuantity: number | null;
  unitPrice: number;
};

export type WholesaleProduct = {
  id: number;
  title: string;
  description: string;
  unitPrice: number;
  currency: string;
  images: string[];
  category: string | null;
  country: string | null;
  city: string | null;
  warehouseName: string | null;
  warehouseCity: string | null;
  minOrderQty: number;
  wholesaleUnitType: string;
  stockQuantity: number;
  sku: string | null;
  status: string;
  contactOnly: boolean;
  offersLocalDelivery: boolean;
  offersWarehousePickup: boolean;
  sellerId: number;
  sellerName: string | null;
  sellerAvatar: string | null;
  tiers: WholesaleTier[];
  createdAt: string;
  updatedAt: string;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function headers(token: string): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchWholesaleProducts(
  params: { q?: string; country?: string; mine?: boolean } | undefined,
  opts: AuthOpts,
): Promise<WholesaleProduct[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.country) qs.set("country", params.country);
  if (params?.mine) qs.set("mine", "1");
  const res = await fetch(`${getApiBase()}/wholesale/products?${qs}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load wholesale products");
  return data.products ?? [];
}

export async function fetchWholesaleProduct(id: number, opts: AuthOpts): Promise<WholesaleProduct> {
  const res = await fetch(`${getApiBase()}/wholesale/products/${id}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Product not found");
  return data.product;
}

export async function createWholesaleProduct(
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<WholesaleProduct> {
  const res = await fetch(`${getApiBase()}/wholesale/products`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not create product");
  return data.product;
}

export async function patchWholesaleProduct(
  id: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<WholesaleProduct> {
  const res = await fetch(`${getApiBase()}/wholesale/products/${id}`, {
    method: "PATCH",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not update product");
  return data.product;
}

/** Start / reuse a wholesale chat (conversationType=wholesale). Seeds "From Flexa Wholesale". */
export async function startWholesaleChat(
  input: { sellerId: number; productId: number; productTitle: string; qty?: number },
  opts: AuthOpts,
): Promise<{ id: number }> {
  const res = await fetch(`${getApiBase()}/wholesale/conversations`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(input),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not start wholesale chat");
  return { id: Number(data.id) };
}

export function priceForQty(product: WholesaleProduct, qty: number): number {
  const sorted = [...(product.tiers ?? [])].sort((a, b) => b.minQuantity - a.minQuantity);
  for (const tier of sorted) {
    const inMin = qty >= tier.minQuantity;
    const inMax = tier.maxQuantity == null || qty <= tier.maxQuantity;
    if (inMin && inMax) return tier.unitPrice;
  }
  return product.unitPrice;
}

export function formatMoney(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}
