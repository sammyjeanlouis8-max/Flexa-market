export type ListingsFilter = {
  q?: string;
  category?: string;
  subcategory?: string;
  minPrice?: string;
  maxPrice?: string;
  condition?: string;
  city?: string;
  country?: string;
  boosted?: boolean;
  page?: number;
  limit?: number;
};

/** Build GET /listings query string. Guests must include a canonical country name. */
export function buildListingsQuery(filter: ListingsFilter, opts: { guest: boolean }): string {
  const params = new URLSearchParams();
  const page = filter.page && filter.page > 0 ? filter.page : 1;
  const limit = Math.min(Math.max(filter.limit ?? 20, 1), 50);
  params.set("page", String(page));
  params.set("limit", String(limit));

  if (filter.q?.trim()) params.set("q", filter.q.trim());
  if (filter.category?.trim()) params.set("category", filter.category.trim());
  if (filter.subcategory?.trim()) params.set("subcategory", filter.subcategory.trim());
  if (filter.minPrice?.trim()) params.set("minPrice", filter.minPrice.trim());
  if (filter.maxPrice?.trim()) params.set("maxPrice", filter.maxPrice.trim());
  if (filter.condition?.trim()) params.set("condition", filter.condition.trim());
  if (filter.city?.trim()) params.set("city", filter.city.trim());
  if (filter.boosted) params.set("boosted", "true");

  // Authed users are country-gated by the server from their profile.
  // Guests MUST pass a canonical country or the API returns an empty feed.
  if (opts.guest && filter.country?.trim()) {
    params.set("country", filter.country.trim());
  }

  return params.toString();
}
