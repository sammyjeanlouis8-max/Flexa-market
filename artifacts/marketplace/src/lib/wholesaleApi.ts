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
  verificationStatus: string;
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
  warehouseId?: number | null;
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

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchWholesaleProducts(params?: {
  q?: string;
  country?: string;
  mine?: boolean;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<WholesaleProduct[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.country) qs.set("country", params.country);
  if (params?.mine) qs.set("mine", "1");
  if (params?.status) qs.set("status", params.status);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const res = await fetch(`/api/wholesale/products?${qs.toString()}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load wholesale products");
  return data.products ?? [];
}

export async function fetchWholesaleProduct(id: number): Promise<WholesaleProduct> {
  const res = await fetch(`/api/wholesale/products/${id}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Product not found");
  return data.product;
}

export async function createWholesaleProduct(body: Record<string, unknown>): Promise<WholesaleProduct> {
  const res = await fetch("/api/wholesale/products", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not create product");
  return data.product;
}

export async function fetchWarehouses(params?: {
  mine?: boolean;
  country?: string;
  verified?: boolean;
  admin?: boolean;
  status?: string;
}): Promise<WholesaleWarehouse[]> {
  const qs = new URLSearchParams();
  if (params?.mine) qs.set("mine", "1");
  if (params?.country) qs.set("country", params.country);
  if (params?.verified === false) qs.set("verified", "0");
  if (params?.admin) qs.set("admin", "1");
  if (params?.status) qs.set("status", params.status);
  const res = await fetch(`/api/wholesale/warehouses?${qs.toString()}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load warehouses");
  return data.warehouses ?? [];
}

export async function createWarehouse(body: Record<string, unknown>): Promise<WholesaleWarehouse> {
  const res = await fetch("/api/wholesale/warehouses", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not create warehouse");
  return data.warehouse;
}

export async function patchWarehouse(id: number, body: Record<string, unknown>): Promise<WholesaleWarehouse> {
  const res = await fetch(`/api/wholesale/warehouses/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not update warehouse");
  return data.warehouse;
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
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}
