/**
 * Product search helpers — shared by GET /listings and GET /listings/suggest.
 * Keeps matching / ranking logic out of the route handlers.
 */

/** Escape LIKE/ILIKE wildcards so user input cannot broaden the pattern. */
export function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Normalize a free-text search query for matching and history.
 * Strips LIKE wildcards so patterns stay literal without needing ESCAPE.
 */
export function normalizeSearchQuery(raw: unknown, maxLen = 120): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[%_]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLen);
}

/** Split into significant tokens (length ≥ 2). */
export function searchTokens(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 8);
}

/**
 * Lightweight Levenshtein distance for short "did you mean" suggestions.
 * Caps work for strings longer than 40 chars.
 */
export function editDistance(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s === t) return 0;
  if (s.length > 40 || t.length > 40) return Math.abs(s.length - t.length) + 10;
  const m = s.length;
  const n = t.length;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Pick the closest popular/history term for a typo'd query.
 * Returns null when the query already matches closely enough.
 */
export function suggestCorrection(
  query: string,
  candidates: string[],
  maxDistance = 2,
): string | null {
  const q = query.trim().toLowerCase();
  if (q.length < 3 || candidates.length === 0) return null;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const term = c.trim().toLowerCase();
    if (!term || term === q) continue;
    // Prefer prefix/contains matches with small typos
    if (term.includes(q) || q.includes(term)) {
      const d = Math.abs(term.length - q.length);
      if (d <= maxDistance && d < bestDist) {
        best = c.trim();
        bestDist = d;
      }
      continue;
    }
    const d = editDistance(q, term);
    if (d > 0 && d <= maxDistance && d < bestDist) {
      best = c.trim();
      bestDist = d;
    }
  }
  return best;
}

/** Build an ILIKE contains pattern with escaped wildcards. */
export function containsPattern(raw: string): string {
  return `%${escapeIlikePattern(raw)}%`;
}

/** Build an ILIKE prefix pattern with escaped wildcards. */
export function prefixPattern(raw: string): string {
  return `${escapeIlikePattern(raw)}%`;
}
