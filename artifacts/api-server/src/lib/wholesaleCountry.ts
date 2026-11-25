const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

/** Normalize country labels for strict marketplace matching (Haiti === haiti). */
export function normalizeWholesaleCountry(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw.replace(/\s+/g, " ");
}

export function countriesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeWholesaleCountry(a);
  const right = normalizeWholesaleCountry(b);
  if (!left || !right) return false;
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * Buyer visibility country comes from the authenticated account only.
 * Query `country` cannot override buyer marketplace (prevents spoofing).
 * Sellers (`mine`) may optionally filter their multi-country depots via query.
 * Super Admin may browse all countries, or filter with query `country`.
 */
export function resolveBuyerCountry(opts: {
  queryCountry?: string | null;
  profileCountry?: string | null;
  mine?: boolean;
  admin?: boolean;
}): { country: string | null; error?: string; allCountries?: boolean } {
  if (opts.admin) {
    const queried = normalizeWholesaleCountry(opts.queryCountry);
    return { country: queried, allCountries: !queried };
  }
  if (opts.mine) {
    return { country: normalizeWholesaleCountry(opts.queryCountry) };
  }
  const country = normalizeWholesaleCountry(opts.profileCountry);
  if (!country) {
    return {
      country: null,
      error: "Your account country is required to browse Flexa Wholesale. Update your profile country.",
    };
  }
  return { country };
}

/** Warehouse must be active + verified and match product country + seller ownership. */
export function isWarehouseBuyerVisible(opts: {
  warehouse: {
    sellerId: number;
    country: string;
    verificationStatus: string;
    isActive: boolean;
  } | null | undefined;
  product: { sellerId: number; country: string | null };
  buyerCountry: string;
}): boolean {
  const wh = opts.warehouse;
  if (!wh) return false;
  if (!wh.isActive) return false;
  if (wh.verificationStatus !== "verified") return false;
  if (wh.sellerId !== opts.product.sellerId) return false;
  if (!countriesMatch(wh.country, opts.product.country)) return false;
  if (!countriesMatch(opts.product.country, opts.buyerCountry)) return false;
  return true;
}

export function parsePagination(query: { limit?: unknown; offset?: unknown; page?: unknown }): {
  limit: number;
  offset: number;
} {
  let limit = Math.floor(Number(query.limit ?? DEFAULT_PAGE_LIMIT));
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_PAGE_LIMIT;
  if (limit > MAX_PAGE_LIMIT) limit = MAX_PAGE_LIMIT;

  let offset = Math.floor(Number(query.offset ?? 0));
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  if (query.offset == null && query.page != null) {
    const page = Math.floor(Number(query.page));
    if (Number.isFinite(page) && page > 1) offset = (page - 1) * limit;
  }

  return { limit, offset };
}
