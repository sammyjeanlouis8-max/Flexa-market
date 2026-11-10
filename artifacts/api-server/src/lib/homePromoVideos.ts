/**
 * Home page promotional video surface rules.
 *
 * Home shows at most TWO latest eligible promo videos (server-side LIMIT 2).
 * The full Promotional Videos feed remains paginated and unbounded.
 */

export const HOME_PROMO_VIDEO_LIMIT = 2;

export type HomePromoFeedQuery = {
  surface: "home" | "feed";
  page: number;
  limit: number;
  sort: "all" | "trending" | "new" | "mine";
};

/**
 * Normalize feed query params for the Home surface.
 * - Forces newest-first ordering (activation / boost start)
 * - Hard-caps LIMIT at 2
 * - Forces page 1 (Home never paginates this strip)
 */
export function resolveHomePromoFeedQuery(input: {
  surface?: string | null;
  page?: number | string | null;
  limit?: number | string | null;
  sort?: string | null;
}): HomePromoFeedQuery {
  const surfaceRaw = String(input.surface ?? "").trim().toLowerCase();
  const isHome = surfaceRaw === "home";

  const pageRaw = Math.max(1, parseInt(String(input.page ?? "1"), 10) || 1);
  const limitRaw = Math.min(20, Math.max(1, parseInt(String(input.limit ?? (isHome ? "2" : "10")), 10) || (isHome ? 2 : 10)));
  const sortRaw = String(input.sort ?? (isHome ? "new" : "all")).trim().toLowerCase();
  const sort = (["all", "trending", "new", "mine"].includes(sortRaw) ? sortRaw : "all") as
    HomePromoFeedQuery["sort"];

  if (!isHome) {
    return {
      surface: "feed",
      page: pageRaw,
      limit: limitRaw,
      sort,
    };
  }

  return {
    surface: "home",
    page: 1,
    limit: Math.min(HOME_PROMO_VIDEO_LIMIT, limitRaw),
    sort: "new",
  };
}

/** Client/server helper: never render more than two Home promo cards. */
export function takeHomePromoVideos<T>(videos: T[]): T[] {
  return videos.slice(0, HOME_PROMO_VIDEO_LIMIT);
}
