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

export type WholesaleWarehouse = {
  id: number;
  sellerId: number;
  sellerName?: string | null;
  name: string;
  country: string;
  region: string | null;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  verificationStatus: "pending" | "verified" | "rejected" | string;
  verifiedAt: string | null;
  rejectionReason?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  warehouseId: number | null;
  warehouseName: string | null;
  warehouseCity: string | null;
  warehouse?: WholesaleWarehouse | null;
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

export type WholesaleInventoryRow = {
  id: number;
  warehouseId: number;
  warehouseName: string;
  warehouseCountry: string;
  productId: number;
  productTitle: string;
  sku: string | null;
  stockQuantity: number;
  productStatus: string;
  updatedAt: string;
};

export type WholesaleSellerStats = {
  listings: { active: number; draft: number; archived: number };
  warehouses: { total: number; verified: number };
  openInquiries: number;
  sellableCountries: string[];
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
  params: {
    q?: string;
    country?: string;
    category?: string;
    warehouseId?: number;
    mine?: boolean;
    status?: string;
  } | undefined,
  opts: AuthOpts,
): Promise<WholesaleProduct[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.country) qs.set("country", params.country);
  if (params?.category) qs.set("category", params.category);
  if (params?.warehouseId) qs.set("warehouseId", String(params.warehouseId));
  if (params?.mine) qs.set("mine", "1");
  if (params?.status) qs.set("status", params.status);
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

export async function fetchWarehouses(
  params: { mine?: boolean; country?: string; verified?: boolean; admin?: boolean; status?: string } | undefined,
  opts: AuthOpts,
): Promise<WholesaleWarehouse[]> {
  const qs = new URLSearchParams();
  if (params?.mine) qs.set("mine", "1");
  if (params?.country) qs.set("country", params.country);
  if (params?.verified === false) qs.set("verified", "0");
  if (params?.admin) qs.set("admin", "1");
  if (params?.status) qs.set("status", params.status);
  const res = await fetch(`${getApiBase()}/wholesale/warehouses?${qs}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load warehouses");
  return data.warehouses ?? [];
}

export async function createWarehouse(
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<WholesaleWarehouse> {
  const res = await fetch(`${getApiBase()}/wholesale/warehouses`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not create warehouse");
  return data.warehouse;
}

export async function patchWarehouse(
  id: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<WholesaleWarehouse> {
  const res = await fetch(`${getApiBase()}/wholesale/warehouses/${id}`, {
    method: "PATCH",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not update warehouse");
  return data.warehouse;
}

export async function fetchInventory(opts: AuthOpts & { warehouseId?: number }): Promise<{
  inventory: WholesaleInventoryRow[];
  warehouses: WholesaleWarehouse[];
}> {
  const qs = new URLSearchParams();
  if (opts.warehouseId) qs.set("warehouseId", String(opts.warehouseId));
  const res = await fetch(`${getApiBase()}/wholesale/inventory?${qs}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load inventory");
  return { inventory: data.inventory ?? [], warehouses: data.warehouses ?? [] };
}

export async function patchInventoryStock(
  id: number,
  stockQuantity: number,
  opts: AuthOpts,
): Promise<void> {
  const res = await fetch(`${getApiBase()}/wholesale/inventory/${id}`, {
    method: "PATCH",
    headers: headers(opts.token),
    body: JSON.stringify({ stockQuantity }),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not update stock");
}

export async function fetchSellerStats(opts: AuthOpts): Promise<WholesaleSellerStats> {
  const res = await fetch(`${getApiBase()}/wholesale/seller/stats`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load seller stats");
  return data as WholesaleSellerStats;
}

export async function fetchFavorites(opts: AuthOpts): Promise<WholesaleProduct[]> {
  const res = await fetch(`${getApiBase()}/wholesale/favorites`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load favorites");
  return (data.favorites ?? []).map((f: any) => f.product);
}

export async function addFavorite(productId: number, opts: AuthOpts): Promise<void> {
  const res = await fetch(`${getApiBase()}/wholesale/favorites`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify({ productId }),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not favorite");
}

export async function removeFavorite(productId: number, opts: AuthOpts): Promise<void> {
  const res = await fetch(`${getApiBase()}/wholesale/favorites/${productId}`, {
    method: "DELETE",
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not unfavorite");
}

export async function fetchInquiries(
  role: "buyer" | "seller",
  opts: AuthOpts,
): Promise<Array<{
  id: number;
  productId: number | null;
  productTitle: string | null;
  qty: number;
  message: string;
  status: string;
  conversationId: number | null;
  createdAt: string;
}>> {
  const res = await fetch(`${getApiBase()}/wholesale/inquiries?role=${role}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load inquiries");
  return data.inquiries ?? [];
}

export async function fetchAdminOverview(opts: AuthOpts): Promise<{
  products: { active: number; draft: number; total: number };
  warehouses: { pending: number; verified: number; total: number };
  sellers: number;
  publicLaunch: boolean;
}> {
  const res = await fetch(`${getApiBase()}/wholesale/admin/overview`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load admin overview");
  return data;
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
