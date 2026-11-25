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
 * Buyer browse country: explicit query wins, else profile country.
 * Sellers listing `mine=1` and Super Admin admin views may skip.
 */
export function resolveBuyerCountry(opts: {
  queryCountry?: string | null;
  profileCountry?: string | null;
  mine?: boolean;
  admin?: boolean;
}): { country: string | null; error?: string } {
  if (opts.mine || opts.admin) {
    return { country: normalizeWholesaleCountry(opts.queryCountry) };
  }
  const country =
    normalizeWholesaleCountry(opts.queryCountry) ||
    normalizeWholesaleCountry(opts.profileCountry);
  if (!country) {
    return {
      country: null,
      error: "Marketplace country is required. Set your profile country or pass ?country=",
    };
  }
  return { country };
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

  // Optional 1-based page= when offset omitted
  if (query.offset == null && query.page != null) {
    const page = Math.floor(Number(query.page));
    if (Number.isFinite(page) && page > 1) offset = (page - 1) * limit;
  }

  return { limit, offset };
}
