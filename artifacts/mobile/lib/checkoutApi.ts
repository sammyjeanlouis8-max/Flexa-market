/**
 * Cart shipping helpers + addresses — DigitalOcean APIs shared with the website.
 * Native Android checkout never debits wallet / Card FM / MonCash; physical goods
 * pay via Stripe (see stripeCheckoutApi + checkout.tsx).
 */
import { getApiBase } from "./api";

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

export type CheckoutOrder = {
  txId: number;
  sellerId: number;
  amount: number;
  deliveryFee?: number;
  title: string;
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

/** Dominican listings use the same Stripe path as other physical goods on Android. */
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
