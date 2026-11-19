/**
 * Home promotional video strip rules — mirrors marketplace web
 * (`HOME_PROMO_VIDEO_CARD_LIMIT` / `selectHomePromoVideos`).
 *
 * Home paints at most TWO newest eligible promos side-by-side.
 * The full feed (hub + watch pager) stays uncapped.
 */

export const HOME_PROMO_VIDEO_CARD_LIMIT = 2;

/** Bound the Home preview query; eligibility is still server-side. */
export const HOME_PROMO_VIDEO_PREVIEW_QUERY_LIMIT = HOME_PROMO_VIDEO_CARD_LIMIT;

export type HomePromoCandidate = {
  id: number;
  boostEndAt?: string | null;
  boostStartAt?: string | null;
  createdAt?: string | null;
};

/** Live (non-expired) promos, newest first, capped at `limit` (default 2). */
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
