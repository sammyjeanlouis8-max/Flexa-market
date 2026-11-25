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
}): Promise<WholesaleProduct[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.country) qs.set("country", params.country);
  if (params?.mine) qs.set("mine", "1");
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
