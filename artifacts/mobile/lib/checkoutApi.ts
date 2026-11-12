/**
 * Cart checkout + delivery + addresses — same DigitalOcean APIs as the website.
 * Cart checkout is wallet-only (Card FM); Dominican listings require item checkout.
 */
import { getApiBase } from "./api";

export type WalletBalance = {
  balanceUsd: number;
  availableUsd: number;
  promoBalance: number;
  currency: string;
};

export type DeliveryQuote = {
  feeUsd: number;
  distanceKm?: number;
  sellerCity?: string;
  message?: string;
};

export type SavedUserAddress = {
  id: number;
  kind?: string;
  label?: string;
  fullName: string;
  phone: string;
  email?: string | null;
  street: string;
  apartment?: string | null;
  city: string;
  region: string;
  postalCode?: string | null;
  country: string;
  isDefault?: boolean;
};

export type CartCheckoutItem = {
  listingId: number;
  quantity: number;
  /** Optional — validated server-side when listing_variants table exists. */
  variantId?: number;
};

/** Matches POST /api/cart/checkout body used by marketplace Cart.tsx */
export type CartCheckoutPayload = {
  items: CartCheckoutItem[];
  shippingName: string;
  shippingPhone: string;
  shippingEmail?: string | null;
  shippingStreet?: string | null;
  shippingCity: string;
  shippingRegion?: string | null;
  paymentMethod: "wallet";
  deliveryMethod: "motorcycle" | "car";
};

export type CheckoutOrder = {
  txId: number;
  sellerId: number;
  amount: number;
  deliveryFee?: number;
  title: string;
};

export type CartCheckoutResult = {
  ok?: boolean;
  orders?: CheckoutOrder[];
  total?: number;
  deliveryTotal?: number;
  grandTotal?: number;
  refundedCount?: number;
  error?: string;
  code?: string;
};

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

export async function fetchWalletBalance(opts: AuthOpts): Promise<WalletBalance> {
  const res = await authedFetch("/wallet/balance", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Wallet balance failed (${res.status})`);
  return {
    balanceUsd: Number(data.balanceUsd ?? 0),
    availableUsd: Number(data.availableUsd ?? data.balanceUsd ?? 0),
    promoBalance: Number(data.promoBalance ?? 0),
    currency: "USD",
  };
}

/**
 * POST /api/delivery/calculate-price
 * Body: sellerCity, buyerCity, country, method [, listingPriceUsd]
 */
export async function calculateDeliveryPrice(
  input: {
    sellerCity: string;
    buyerCity: string;
    country: string;
    method?: "motorcycle" | "car";
    listingPriceUsd?: number;
  },
  opts: AuthOpts,
): Promise<DeliveryQuote> {
  const res = await authedFetch("/delivery/calculate-price", {
    ...opts,
    method: "POST",
    body: {
      sellerCity: input.sellerCity,
      buyerCity: input.buyerCity,
      country: input.country,
      method: input.method ?? "motorcycle",
      listingPriceUsd: input.listingPriceUsd,
    },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Delivery quote failed (${res.status})`);
  return {
    feeUsd: Number(data.feeUsd ?? data.price ?? 0),
    distanceKm: data.distanceKm != null ? Number(data.distanceKm) : undefined,
    sellerCity: data.sellerCity ?? input.sellerCity,
    message: data.message,
  };
}

export async function fetchUserAddresses(
  opts: AuthOpts,
  kind: "delivery" | "ship_from" = "delivery",
): Promise<{ addresses: SavedUserAddress[]; defaultAddress: SavedUserAddress | null }> {
  const res = await authedFetch(`/me/addresses?kind=${encodeURIComponent(kind)}`, opts);
  const data = await readJson(res);
  if (!res.ok) {
    return { addresses: [], defaultAddress: null };
  }
  return {
    addresses: Array.isArray(data.addresses) ? data.addresses : [],
    defaultAddress: data.defaultAddress ?? null,
  };
}

export async function persistCheckoutAddress(
  opts: AuthOpts,
  body: {
    fullName: string;
    phone: string;
    street: string;
    city: string;
    region: string;
    country: string;
    label?: string;
  },
): Promise<void> {
  try {
    await authedFetch("/me/addresses", {
      ...opts,
      method: "POST",
      body: {
        kind: "delivery",
        label: body.label ?? "Checkout",
        fullName: body.fullName,
        phone: body.phone,
        street: body.street || "N/A",
        city: body.city,
        region: body.region || "N/A",
        country: body.country,
        isDefault: true,
      },
    });
  } catch {
    /* non-blocking — same as website */
  }
}

/**
 * Wallet-only multi-item checkout — same contract as marketplace Cart.tsx.
 * Server rejects Dominican Republic listings with DOMINICAN_ITEM_CHECKOUT_REQUIRED.
 * Stripe is not accepted on this endpoint (wallet / Card FM only).
 */
export async function cartCheckout(
  payload: CartCheckoutPayload,
  opts: AuthOpts,
): Promise<CartCheckoutResult> {
  const res = await authedFetch("/cart/checkout", {
    ...opts,
    method: "POST",
    body: payload,
  });
  const data = await readJson(res);
  if (!res.ok) {
    return {
      ok: false,
      error: data.error || `Checkout failed (${res.status})`,
      code: data.code,
    };
  }
  return {
    ok: true,
    orders: Array.isArray(data.orders) ? data.orders : [],
    total: Number(data.total ?? 0),
    deliveryTotal: Number(data.deliveryTotal ?? 0),
    grandTotal: Number(data.grandTotal ?? 0),
    refundedCount: Number(data.refundedCount ?? 0),
  };
}

/** Dominican listings cannot use cart wallet checkout — buy on listing page. */
export function isDominicanListingCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  const c = country.trim().toLowerCase();
  return c === "dominican republic" || c === "do" || c === "república dominicana";
}

export function cartHasDominicanItems(
  items: Array<{ country?: string | null }>,
): boolean {
  return items.some((i) => isDominicanListingCountry(i.country));
}
