/**
 * Home promo companion selection — mirrors marketplace boostAdControls rules
 * so website, WebView, and native Home pick the same product for the empty
 * column beside a single promotional video.
 */

export const HOME_PROMO_VIDEO_CARD_LIMIT = 2;
export const HOME_PROMO_VIDEO_PREVIEW_QUERY_LIMIT = HOME_PROMO_VIDEO_CARD_LIMIT;

export type HomePromoCandidate = {
  id: number;
  boostEndAt?: string | null;
  createdAt?: string | null;
  boostStartAt?: string | null;
};

export function selectHomePromoVideos<T extends HomePromoCandidate>(
  videos: T[],
  limit = HOME_PROMO_VIDEO_CARD_LIMIT,
  nowMs: number = Date.now(),
): T[] {
  const live = videos.filter((v) => {
    if (!v.boostEndAt) return true;
    const end = new Date(v.boostEndAt).getTime();
    return Number.isFinite(end) ? end > nowMs : true;
  });

  const rank = (v: T): number => {
    const start = v.boostStartAt ? new Date(v.boostStartAt).getTime() : NaN;
    const created = v.createdAt ? new Date(v.createdAt).getTime() : NaN;
    if (Number.isFinite(start)) return start;
    if (Number.isFinite(created)) return created;
    return v.id;
  };

  return [...live]
    .sort((a, b) => rank(b) - rank(a) || b.id - a.id)
    .slice(0, Math.max(0, limit));
}

export type HomePromoCompanionCandidate = {
  id: number;
  status?: string | null;
  country?: string | null;
  images?: Array<string | null | undefined> | null;
};

export function selectHomePromoCompanionProduct<T extends HomePromoCompanionCandidate>(
  candidates: T[],
  options: {
    excludeListingIds: number[];
    activeCountry?: string | null;
    skipCountryFilter?: boolean;
  },
): T | null {
  const exclude = new Set(options.excludeListingIds);
  const country = options.activeCountry ?? null;
  const skipCountry = options.skipCountryFilter ?? false;

  const eligible = candidates.filter((listing) => {
    if (exclude.has(listing.id)) return false;
    if (listing.status && listing.status !== "available" && listing.status !== "active") {
      return false;
    }
    if (!skipCountry && country && listing.country && listing.country !== country) {
      return false;
    }
    return true;
  });

  const withImage = eligible.find((listing) =>
    (listing.images ?? []).some((img) => typeof img === "string" && img.trim().length > 0),
  );
  return withImage ?? eligible[0] ?? null;
}
