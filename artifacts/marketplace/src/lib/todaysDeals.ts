/**
 * Today's Deals slot selection: boosted listings first, then high-quality
 * regular listings so the two-column grid never shows empty product slots.
 */

export type TodaysDealCandidate = {
  id: number;
  isBoosted: boolean;
  boostExpiresAt?: string | null;
  isFeatured?: boolean;
  status?: string | null;
  lifecycleStatus?: string | null;
  moderationStatus?: string | null;
  images?: string[] | null;
  viewCount?: number | null;
  favoriteCount?: number | null;
  createdAt?: string | null;
  country?: string | null;
  categorySlug?: string | null;
};

export type TodaysDealSlotResult<T extends TodaysDealCandidate> = {
  /** Up to `slotCount` listings for the grid (never padded with nulls). */
  slots: T[];
  /** How many selected slots are genuinely active boosted listings. */
  boostedCount: number;
  /** True when any non-boosted fallback fills a slot. */
  usedFallback: boolean;
  /** Use a neutral heading ("Today's Picks") when fallbacks are mixed in. */
  useNeutralHeading: boolean;
};

const BLOCKED_LIFECYCLES = new Set(["suspended", "archived", "deleted", "sold", "rejected", "draft"]);

/** Active paid boost that has not expired. */
export function isActivelyBoosted(listing: TodaysDealCandidate, nowMs = Date.now()): boolean {
  if (!listing.isBoosted) return false;
  if (listing.boostExpiresAt) {
    const expires = new Date(listing.boostExpiresAt).getTime();
    if (Number.isFinite(expires) && expires <= nowMs) return false;
  }
  return true;
}

/** Publicly visible listing safe to show in discovery surfaces. */
export function isEligibleDealListing(listing: TodaysDealCandidate): boolean {
  if (!listing || !Number.isInteger(listing.id)) return false;
  if (listing.status && listing.status !== "available") return false;
  if (listing.lifecycleStatus && BLOCKED_LIFECYCLES.has(listing.lifecycleStatus)) return false;
  if (listing.moderationStatus && listing.moderationStatus !== "approved") return false;
  return true;
}

/**
 * Prefer recently added, image-backed, higher-engagement products.
 * Uses only real metrics — never invents views/likes.
 */
export function dealFallbackQualityScore(listing: TodaysDealCandidate, nowMs = Date.now()): number {
  const images = (listing.images ?? []).filter((img) => typeof img === "string" && img.trim().length > 0);
  let score = 0;
  if (images.length > 0) score += 200;
  if (images.length > 1) score += 40;
  score += Math.min(Math.max(0, listing.viewCount ?? 0), 800);
  score += Math.min(Math.max(0, listing.favoriteCount ?? 0) * 12, 240);
  if (listing.isFeatured) score += 80;
  if (listing.createdAt) {
    const created = new Date(listing.createdAt).getTime();
    if (Number.isFinite(created)) {
      const ageDays = Math.max(0, (nowMs - created) / 86_400_000);
      score += Math.max(0, 120 - ageDays * 2);
    }
  }
  return score;
}

function sortByFallbackQuality<T extends TodaysDealCandidate>(items: T[], nowMs: number): T[] {
  return [...items].sort((a, b) => {
    const diff = dealFallbackQualityScore(b, nowMs) - dealFallbackQualityScore(a, nowMs);
    if (diff !== 0) return diff;
    return b.id - a.id;
  });
}

/**
 * Fill exactly `slotCount` product slots (or fewer if the catalog is thin):
 * 1. Active boosted listings first
 * 2. Remaining slots from eligible regular listings (no duplicates)
 */
export function selectTodaysDealSlots<T extends TodaysDealCandidate>(
  candidates: T[],
  options?: {
    slotCount?: number;
    nowMs?: number;
    activeCategory?: string | null;
    activeCountry?: string | null;
    /** Admins may browse across countries; skip country match when true. */
    skipCountryFilter?: boolean;
  },
): TodaysDealSlotResult<T> {
  const slotCount = options?.slotCount ?? 2;
  const nowMs = options?.nowMs ?? Date.now();
  const activeCategory = options?.activeCategory ?? null;
  const activeCountry = options?.activeCountry ?? null;
  const skipCountry = options?.skipCountryFilter ?? false;

  const eligible = candidates.filter((listing) => {
    if (!isEligibleDealListing(listing)) return false;
    if (activeCategory && listing.categorySlug && listing.categorySlug !== activeCategory) return false;
    if (!skipCountry && activeCountry && listing.country && listing.country !== activeCountry) return false;
    return true;
  });

  const seen = new Set<number>();
  const boosted: T[] = [];
  const regular: T[] = [];

  for (const listing of eligible) {
    if (seen.has(listing.id)) continue;
    seen.add(listing.id);
    if (isActivelyBoosted(listing, nowMs)) boosted.push(listing);
    else regular.push(listing);
  }

  const rankedBoosted = sortByFallbackQuality(boosted, nowMs);
  const rankedRegular = sortByFallbackQuality(regular, nowMs);

  const slots: T[] = rankedBoosted.slice(0, slotCount);
  const missing = Math.max(0, slotCount - slots.length);
  if (missing > 0) {
    slots.push(...rankedRegular.slice(0, missing));
  }

  const boostedCount = slots.filter((l) => isActivelyBoosted(l, nowMs)).length;
  const usedFallback = slots.some((l) => !isActivelyBoosted(l, nowMs));

  return {
    slots,
    boostedCount,
    usedFallback,
    useNeutralHeading: usedFallback || boostedCount === 0,
  };
}
