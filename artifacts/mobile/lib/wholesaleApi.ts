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
  videos: string[];
  featured?: boolean;
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

export type WholesaleSellerProfile = {
  id: number;
  userId: number;
  businessName: string;
  bio: string;
  phone: string | null;
  website: string | null;
  plan: string;
  onboardingComplete: boolean;
  verificationStatus: string;
  hours: Record<string, unknown>;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WholesaleInquiryDetail = {
  id: number;
  buyerId: number;
  sellerId: number;
  productId: number | null;
  qty: number;
  message: string;
  status: string;
  quotedUnitPrice: number | null;
  conversationId: number | null;
  createdAt: string;
  updatedAt: string;
  product?: WholesaleProduct | null;
  buyer?: { id: number; name: string; avatar: string | null } | null;
  seller?: { id: number; name: string; avatar: string | null } | null;
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

export type WholesalePagination = {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
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

export async function fetchWholesaleProductsPage(
  params: {
    q?: string;
    country?: string;
    city?: string;
    category?: string;
    warehouseId?: number;
    featured?: boolean;
    mine?: boolean;
    status?: string;
    limit?: number;
    offset?: number;
    page?: number;
  } | undefined,
  opts: AuthOpts,
): Promise<{ products: WholesaleProduct[]; pagination: WholesalePagination; countryFilter?: string | null }> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.country) qs.set("country", params.country);
  if (params?.city) qs.set("city", params.city);
  if (params?.category) qs.set("category", params.category);
  if (params?.warehouseId) qs.set("warehouseId", String(params.warehouseId));
  if (params?.featured) qs.set("featured", "1");
  if (params?.mine) qs.set("mine", "1");
  if (params?.status) qs.set("status", params.status);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  if (params?.page != null) qs.set("page", String(params.page));
  const res = await fetch(`${getApiBase()}/wholesale/products?${qs}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load wholesale products");
  return {
    products: data.products ?? [],
    pagination: data.pagination ?? {
      limit: params?.limit ?? 20,
      offset: params?.offset ?? 0,
      total: (data.products ?? []).length,
      hasMore: false,
    },
    countryFilter: data.countryFilter ?? params?.country ?? null,
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
    limit?: number;
    offset?: number;
  } | undefined,
  opts: AuthOpts,
): Promise<WholesaleProduct[]> {
  const page = await fetchWholesaleProductsPage(params, opts);
  return page.products;
}

export async function fetchWholesaleProduct(
  id: number,
  opts: AuthOpts & { country?: string },
): Promise<WholesaleProduct> {
  const qs = new URLSearchParams();
  if (opts.country) qs.set("country", opts.country);
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await fetch(`${getApiBase()}/wholesale/products/${id}${suffix}`, {
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
  params: {
    mine?: boolean;
    country?: string;
    verified?: boolean;
    admin?: boolean;
    status?: string;
    limit?: number;
    offset?: number;
  } | undefined,
  opts: AuthOpts,
): Promise<WholesaleWarehouse[]> {
  const qs = new URLSearchParams();
  if (params?.mine) qs.set("mine", "1");
  if (params?.country) qs.set("country", params.country);
  if (params?.verified === false) qs.set("verified", "0");
  if (params?.admin) qs.set("admin", "1");
  if (params?.status) qs.set("status", params.status);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
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

export async function fetchFavorites(
  opts: AuthOpts & { country?: string; limit?: number; offset?: number },
): Promise<{ products: WholesaleProduct[]; pagination: WholesalePagination }> {
  const qs = new URLSearchParams();
  if (opts.country) qs.set("country", opts.country);
  if (opts.limit != null) qs.set("limit", String(opts.limit));
  if (opts.offset != null) qs.set("offset", String(opts.offset));
  const res = await fetch(`${getApiBase()}/wholesale/favorites?${qs}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load favorites");
  return {
    products: (data.favorites ?? []).map((f: any) => f.product),
    pagination: data.pagination ?? { limit: 20, offset: 0, total: 0, hasMore: false },
  };
}

export async function addFavorite(
  productId: number,
  opts: AuthOpts & { country?: string },
): Promise<void> {
  const res = await fetch(`${getApiBase()}/wholesale/favorites`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify({ productId, country: opts.country }),
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
  quotedUnitPrice: number | null;
  conversationId: number | null;
  createdAt: string;
  updatedAt?: string;
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

export async function fetchSellerProfile(opts: AuthOpts): Promise<WholesaleSellerProfile> {
  const res = await fetch(`${getApiBase()}/wholesale/seller/profile`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load seller profile");
  return data.profile;
}

export async function patchSellerProfile(
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<WholesaleSellerProfile> {
  const res = await fetch(`${getApiBase()}/wholesale/seller/profile`, {
    method: "PATCH",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not update profile");
  return data.profile;
}

export async function fetchSellerAnalytics(opts: AuthOpts): Promise<{
  products: { active: number; draft: number; featured: number; totalStock: number };
  inquiries: { open: number; quoted: number; closed: number; total: number };
  warehouses: { total: number; verified: number; pending: number };
  plan: string;
  verificationStatus: string;
}> {
  const res = await fetch(`${getApiBase()}/wholesale/seller/analytics`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load analytics");
  return data;
}

export async function fetchSellerCustomers(opts: AuthOpts): Promise<
  Array<{
    buyerId: number;
    buyerName: string | null;
    buyerAvatar: string | null;
    inquiries: number;
    lastAt: string;
  }>
> {
  const res = await fetch(`${getApiBase()}/wholesale/seller/customers`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load customers");
  return data.customers ?? [];
}

export async function fetchSellerEarnings(opts: AuthOpts): Promise<{
  estimatedTotal: number;
  closedDeals: number;
  deals: Array<{
    id: number;
    productId: number | null;
    qty: number;
    quotedUnitPrice: number | null;
    estimatedTotal: number;
    updatedAt: string;
  }>;
  note: string;
}> {
  const res = await fetch(`${getApiBase()}/wholesale/seller/earnings`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load earnings");
  return data;
}

export async function fetchSellerDocuments(opts: AuthOpts): Promise<
  Array<{ id: number; title: string; docType: string; fileUrl: string; status: string; createdAt: string }>
> {
  const res = await fetch(`${getApiBase()}/wholesale/seller/documents`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load documents");
  return data.documents ?? [];
}

export async function createSellerDocument(
  body: { title: string; fileUrl: string; docType?: string },
  opts: AuthOpts,
): Promise<void> {
  const res = await fetch(`${getApiBase()}/wholesale/seller/documents`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not upload document");
}

export async function deleteSellerDocument(id: number, opts: AuthOpts): Promise<void> {
  const res = await fetch(`${getApiBase()}/wholesale/seller/documents/${id}`, {
    method: "DELETE",
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not delete document");
}

export async function fetchSellerTeam(opts: AuthOpts): Promise<
  Array<{ id: number; email: string; role: string; status: string; memberUserId: number | null; createdAt: string }>
> {
  const res = await fetch(`${getApiBase()}/wholesale/seller/team`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load team");
  return data.members ?? [];
}

export async function inviteSellerTeamMember(
  body: { email: string; role?: string },
  opts: AuthOpts,
): Promise<void> {
  const res = await fetch(`${getApiBase()}/wholesale/seller/team`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not invite member");
}

export async function removeSellerTeamMember(id: number, opts: AuthOpts): Promise<void> {
  const res = await fetch(`${getApiBase()}/wholesale/seller/team/${id}`, {
    method: "DELETE",
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not remove member");
}

export async function fetchCompare(opts: AuthOpts): Promise<WholesaleProduct[]> {
  const res = await fetch(`${getApiBase()}/wholesale/compare`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load compare list");
  return data.products ?? [];
}

export async function addCompare(productId: number, opts: AuthOpts): Promise<void> {
  const res = await fetch(`${getApiBase()}/wholesale/compare`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify({ productId }),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not add to compare");
}

export async function removeCompare(productId: number, opts: AuthOpts): Promise<void> {
  const res = await fetch(`${getApiBase()}/wholesale/compare/${productId}`, {
    method: "DELETE",
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not remove from compare");
}

export async function fetchBlocks(opts: AuthOpts): Promise<
  Array<{
    id: number;
    blockedId: number;
    reason: string;
    createdAt: string;
    blockedName: string | null;
    blockedAvatar: string | null;
  }>
> {
  const res = await fetch(`${getApiBase()}/wholesale/blocks`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load blocked sellers");
  return data.blocks ?? [];
}

export async function unblockSeller(blockedId: number, opts: AuthOpts): Promise<void> {
  const res = await fetch(`${getApiBase()}/wholesale/blocks/${blockedId}`, {
    method: "DELETE",
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not unblock");
}

export async function fetchDisputes(opts: AuthOpts): Promise<
  Array<{
    id: number;
    openerId: number;
    againstId: number;
    productId: number | null;
    inquiryId: number | null;
    reason: string;
    status: string;
    createdAt: string;
  }>
> {
  const res = await fetch(`${getApiBase()}/wholesale/disputes`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load disputes");
  return data.disputes ?? [];
}

export async function createDispute(
  body: { againstId: number; reason: string; productId?: number; inquiryId?: number },
  opts: AuthOpts,
): Promise<void> {
  const res = await fetch(`${getApiBase()}/wholesale/disputes`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not open dispute");
}

export async function fetchWholesaleNotifications(
  opts: AuthOpts & { limit?: number; offset?: number },
): Promise<{
  notifications: Array<{
    id: number;
    title: string;
    body: string;
    kind: string;
    href: string | null;
    readAt: string | null;
    createdAt: string;
  }>;
  pagination: WholesalePagination;
}> {
  const qs = new URLSearchParams();
  if (opts.limit != null) qs.set("limit", String(opts.limit));
  if (opts.offset != null) qs.set("offset", String(opts.offset));
  const res = await fetch(`${getApiBase()}/wholesale/notifications?${qs}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load notifications");
  return {
    notifications: data.notifications ?? [],
    pagination: data.pagination ?? { limit: 20, offset: 0, total: 0, hasMore: false },
  };
}

export async function markWholesaleNotificationsRead(
  opts: AuthOpts & { ids?: number[] },
): Promise<void> {
  const res = await fetch(`${getApiBase()}/wholesale/notifications/read`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify({ ids: opts.ids }),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not mark read");
}

export async function fetchInquiry(
  id: number,
  opts: AuthOpts,
): Promise<WholesaleInquiryDetail> {
  const res = await fetch(`${getApiBase()}/wholesale/inquiries/${id}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Inquiry not found");
  return data.inquiry;
}

export async function patchInquiry(
  id: number,
  body: { status?: string; quotedUnitPrice?: number },
  opts: AuthOpts,
): Promise<WholesaleInquiryDetail> {
  const res = await fetch(`${getApiBase()}/wholesale/inquiries/${id}`, {
    method: "PATCH",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not update inquiry");
  return data.inquiry;
}

export async function fetchStore(
  sellerId: number,
  opts: AuthOpts & { limit?: number; offset?: number },
): Promise<{
  seller: { id: number; name: string; avatar: string | null; country: string | null };
  profile: WholesaleSellerProfile | null;
  warehouses: WholesaleWarehouse[];
  products: WholesaleProduct[];
  pagination: WholesalePagination;
}> {
  const qs = new URLSearchParams();
  if (opts.limit != null) qs.set("limit", String(opts.limit));
  if (opts.offset != null) qs.set("offset", String(opts.offset));
  const res = await fetch(`${getApiBase()}/wholesale/stores/${sellerId}?${qs}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Store not found");
  return {
    seller: data.seller,
    profile: data.profile,
    warehouses: data.warehouses ?? [],
    products: data.products ?? [],
    pagination: data.pagination ?? { limit: 20, offset: 0, total: 0, hasMore: false },
  };
}

export async function fetchSellerMedia(opts: AuthOpts): Promise<{
  photos: Array<{ productId: number; title: string; url: string; status: string }>;
  videos: Array<{ productId: number; title: string; url: string; status: string }>;
}> {
  const res = await fetch(`${getApiBase()}/wholesale/seller/media`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load media");
  return { photos: data.photos ?? [], videos: data.videos ?? [] };
}

export async function fetchAdminCategories(opts: AuthOpts): Promise<
  Array<{ category: string | null; count: number; active: number }>
> {
  const res = await fetch(`${getApiBase()}/wholesale/admin/categories`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load categories");
  return data.categories ?? [];
}

export async function fetchAdminCountries(opts: AuthOpts): Promise<
  Array<{ country: string; products: number; warehouses: number; verified: number }>
> {
  const res = await fetch(`${getApiBase()}/wholesale/admin/countries`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load countries");
  return data.countries ?? [];
}

export async function fetchAdminSellers(opts: AuthOpts): Promise<
  Array<{
    sellerId: number;
    sellerName: string | null;
    sellerAvatar: string | null;
    warehouses: number;
    verified: number;
    plan: string;
    verificationStatus: string;
    onboardingComplete: boolean;
  }>
> {
  const res = await fetch(`${getApiBase()}/wholesale/admin/sellers`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load sellers");
  return data.sellers ?? [];
}

export async function fetchAdminChats(opts: AuthOpts): Promise<
  Array<{
    id: number;
    buyerId: number;
    sellerId: number;
    lastMessage: string | null;
    lastMessageAt: string | null;
    conversationType: string | null;
  }>
> {
  const res = await fetch(`${getApiBase()}/wholesale/admin/chats`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load chats");
  return data.conversations ?? [];
}

export async function fetchAdminFlags(opts: AuthOpts): Promise<WholesaleProduct[]> {
  const res = await fetch(`${getApiBase()}/wholesale/admin/flags`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load flagged products");
  return data.products ?? [];
}

export async function fetchAdminReports(opts: AuthOpts): Promise<{
  overview: { openDisputes: number; totalDisputes: number };
  disputes: Array<{
    id: number;
    openerId: number;
    againstId: number;
    reason: string;
    status: string;
    createdAt: string;
  }>;
}> {
  const res = await fetch(`${getApiBase()}/wholesale/admin/reports`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load reports");
  return data;
}
