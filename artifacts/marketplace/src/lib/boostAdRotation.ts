/**
 * Automatic promotional interstitial rotation.
 *
 * Exposure history is persisted locally (survives force-close) and scoped to
 * the signed-in account, or to a stable guest device id. An exposure is only
 * recorded when playback actually begins on screen — fetch/preload does not
 * count. History is separate from billable booster view counters.
 */

export const BOOST_AD_INTERVAL_MS = 5 * 60_000;
export const BOOST_AD_COOLDOWN_KEY = "flexamarket_boost_last_shown";
export const BOOST_AD_ROTATION_KEY_PREFIX = "flexamarket_boost_rotation_";
export const BOOST_AD_GUEST_ID_KEY = "flexamarket_boost_guest_id";
/** Reuse the registration fingerprint id when present. */
export const BOOST_AD_LEGACY_DEVICE_ID_KEY = "bh_device_id";
export const BOOST_AD_MAX_HISTORY = 20;

export type BoostExposure = { id: number; at: number };

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private / quota */
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* private */
  }
}

/** Stable local guest identity for rotation when no account is signed in. */
export function getOrCreateBoostGuestId(): string {
  const existing =
    safeGet(BOOST_AD_GUEST_ID_KEY) || safeGet(BOOST_AD_LEGACY_DEVICE_ID_KEY);
  if (existing) {
    if (!safeGet(BOOST_AD_GUEST_ID_KEY)) safeSet(BOOST_AD_GUEST_ID_KEY, existing);
    return existing;
  }
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `guest_${crypto.randomUUID()}`
      : `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  safeSet(BOOST_AD_GUEST_ID_KEY, id);
  return id;
}

/** Scope key for the signed-in user, or a stable guest device id. */
export function getBoostViewerScopeKey(userId?: number | null): string {
  if (userId != null && Number.isFinite(userId) && userId > 0) {
    return `user_${userId}`;
  }
  return `guest_${getOrCreateBoostGuestId()}`;
}

export function boostRotationStorageKey(scopeKey: string): string {
  return `${BOOST_AD_ROTATION_KEY_PREFIX}${scopeKey}`;
}

/** Parse and normalize persisted exposure history (most recent first). */
export function parseBoostRotationHistory(raw: string | null): BoostExposure[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: BoostExposure[] = [];
    const seen = new Set<number>();
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const id = Number((entry as BoostExposure).id);
      const at = Number((entry as BoostExposure).at);
      if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(at)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, at });
    }
    return out
      .sort((a, b) => b.at - a.at || b.id - a.id)
      .slice(0, BOOST_AD_MAX_HISTORY);
  } catch {
    return [];
  }
}

export function getBoostRotationHistory(scopeKey: string): BoostExposure[] {
  return parseBoostRotationHistory(safeGet(boostRotationStorageKey(scopeKey)));
}

/**
 * Record that listingId actually began playback on screen.
 * Updates last-shown cooldown and rotation history for this viewer scope.
 */
export function recordBoostPlaybackExposure(
  scopeKey: string,
  listingId: number,
  atMs: number = Date.now(),
): BoostExposure[] {
  if (!Number.isFinite(listingId) || listingId <= 0) {
    return getBoostRotationHistory(scopeKey);
  }
  const prev = getBoostRotationHistory(scopeKey).filter((e) => e.id !== listingId);
  const next = [{ id: listingId, at: atMs }, ...prev].slice(0, BOOST_AD_MAX_HISTORY);
  safeSet(boostRotationStorageKey(scopeKey), JSON.stringify(next));
  markBoostAdShown(atMs);
  return next;
}

/** Most-recent-first listing ids for the selection API `exclude` soft-rank. */
export function getBoostExcludeIds(scopeKey: string): number[] {
  return getBoostRotationHistory(scopeKey).map((e) => e.id);
}

export function shouldShowBoostAd(nowMs: number = Date.now()): boolean {
  const raw = safeGet(BOOST_AD_COOLDOWN_KEY);
  if (!raw) return true;
  const last = Number(raw);
  if (!Number.isFinite(last)) return true;
  return nowMs - last >= BOOST_AD_INTERVAL_MS;
}

export function markBoostAdShown(atMs: number = Date.now()): void {
  safeSet(BOOST_AD_COOLDOWN_KEY, String(atMs));
}

/** Clear frequency cooldown so a country/scope change can show a fresh ad. */
export function clearBoostAdCooldown(): void {
  safeRemove(BOOST_AD_COOLDOWN_KEY);
}

/**
 * Pure selection helper for tests: given eligible ids and recent history
 * (most recent first), pick the next id — prefer never-seen, then least
 * recently shown. Returns null when the pool is empty.
 */
export function pickNextBoostRotationId(
  eligibleIds: number[],
  recentIdsMostRecentFirst: number[],
): number | null {
  const pool = [...new Set(eligibleIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0]!;

  const recentIndex = new Map<number, number>();
  recentIdsMostRecentFirst.forEach((id, i) => {
    if (!recentIndex.has(id)) recentIndex.set(id, i);
  });
  const rank = (id: number): number => {
    const idx = recentIndex.get(id);
    if (idx == null) return -1; // never seen — highest priority
    // Most recent (idx 0) → worst rank; oldest → better among seen.
    return recentIdsMostRecentFirst.length - idx;
  };
  return [...pool].sort((a, b) => rank(a) - rank(b) || a - b)[0] ?? null;
}
