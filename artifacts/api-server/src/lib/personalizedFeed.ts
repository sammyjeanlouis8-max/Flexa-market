/**
 * Per-user "For You" ranking helpers.
 *
 * Two people in the same house with different accounts and different search
 * histories must see different top recommendations. Ranking is driven by each
 * user's own search terms (weighted by frequency), not by household / IP / geo.
 */

export type WeightedSearchTerm = {
  query: string;
  /** Higher = searched more often by this user. */
  weight: number;
};

/** Escape `%` / `_` so user search terms cannot widen ILIKE matches. */
export function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Score how well a listing matches this user's search history.
 * Title hits outweigh description hits; frequent terms outweigh rare ones.
 */
export function scoreSearchRelevance(
  title: string | null | undefined,
  description: string | null | undefined,
  terms: WeightedSearchTerm[],
): number {
  if (!terms.length) return 0;
  const titleLc = (title ?? "").toLowerCase();
  const descLc = (description ?? "").toLowerCase();
  let score = 0;
  for (const term of terms) {
    const q = term.query.trim().toLowerCase();
    if (q.length < 2) continue;
    const w = Math.max(1, term.weight);
    if (titleLc.includes(q)) score += 10 * w;
    else if (descLc.includes(q)) score += 4 * w;
  }
  return score;
}

export type PersonalizedRankInput = {
  id: number;
  relevance: number;
  isBoosted: boolean;
  distanceKm: number | null;
  proximity: number;
  createdAt: Date | string | null;
};

/**
 * Stable sort: relevance first (per-user), then boost, then nearer, then newer.
 * Same household geo must not collapse distinct search preferences into one order.
 */
export function comparePersonalizedRank(a: PersonalizedRankInput, b: PersonalizedRankInput): number {
  if (b.relevance !== a.relevance) return b.relevance - a.relevance;
  if (Number(b.isBoosted) !== Number(a.isBoosted)) return Number(b.isBoosted) - Number(a.isBoosted);
  const da = a.distanceKm;
  const db = b.distanceKm;
  if (da != null && db != null && da !== db) return da - db;
  if (da != null && db == null) return -1;
  if (da == null && db != null) return 1;
  if (b.proximity !== a.proximity) return b.proximity - a.proximity;
  const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return tb - ta;
}

export function sortPersonalizedRank<T extends PersonalizedRankInput>(rows: T[]): T[] {
  return [...rows].sort(comparePersonalizedRank);
}
