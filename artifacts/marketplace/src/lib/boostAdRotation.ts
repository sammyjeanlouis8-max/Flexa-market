/**
 * Automatic promotional interstitial rotation + browsing-time delivery.
 *
 * Timing (persisted across app restarts and country changes):
 * - First automatic promotion after 30s of active marketplace browsing
 * - Then at least 15 minutes of active browsing between placements
 * - Cap: 3 automatic promotions per rolling 60-minute window (all countries)
 * - Timer pauses while backgrounded, idle, closed, or an ad is playing
 *
 * Exposure history is scoped to viewer + browsing country. An exposure is
 * recorded only when playback actually begins on screen — fetch/preload does
 * not count. History is separate from billable booster view counters.
 */

export const BOOST_AD_FIRST_DELAY_MS = 30_000;
export const BOOST_AD_INTERVAL_MS = 15 * 60_000;
export const BOOST_AD_ROLLING_WINDOW_MS = 60 * 60_000;
export const BOOST_AD_ROLLING_CAP = 3;
/** No pointer/keyboard/touch for this long → browsing timer pauses (idle). */
export const BOOST_AD_IDLE_MS = 60_000;
/** Tick cadence for accumulating active browsing time. */
export const BOOST_AD_TICK_MS = 1_000;

/** @deprecated Use BOOST_AD_INTERVAL_MS — kept for older imports/tests. */
export const BOOST_AD_COOLDOWN_KEY_PREFIX = "flexamarket_boost_last_shown_";
/** Legacy global cooldown key — migrated into session state when present. */
export const BOOST_AD_COOLDOWN_KEY = "flexamarket_boost_last_shown";
export const BOOST_AD_ROTATION_KEY_PREFIX = "flexamarket_boost_rotation_";
export const BOOST_AD_SESSION_KEY_PREFIX = "flexamarket_boost_browse_";
export const BOOST_AD_GUEST_ID_KEY = "flexamarket_boost_guest_id";
/** Reuse the registration fingerprint id when present. */
export const BOOST_AD_LEGACY_DEVICE_ID_KEY = "bh_device_id";
export const BOOST_AD_MAX_HISTORY = 20;

export type BoostExposure = { id: number; at: number };

export type BoostBrowseSession = {
  /** Active browsing ms accumulated toward the next automatic placement. */
  accumulatedActiveMs: number;
  /** Wall-clock when the accumulator last advanced (null while paused). */
  lastActiveTickAt: number | null;
  /** Timestamps of automatic placements (finish/skip/dismiss/interrupt). */
  deliveryAts: number[];
  /** True after the first automatic placement was consumed. */
  hasDelivered: boolean;
};

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

/** Normalize browsing country for storage keys (empty → unknown). */
export function normalizeBoostBrowsingCountry(
  country?: string | null,
): string {
  const c = (country ?? "").trim().toLowerCase();
  return c || "unknown";
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

/**
 * Viewer-only key for browsing timer + rolling cap (survives country changes).
 */
export function getBoostViewerTimingKey(userId?: number | null): string {
  if (userId != null && Number.isFinite(userId) && userId > 0) {
    return `user_${userId}`;
  }
  return `guest_${getOrCreateBoostGuestId()}`;
}

/**
 * Scope key for the signed-in user (or stable guest id) + browsing country.
 * Country switch must not reuse another market's playback history.
 */
export function getBoostViewerScopeKey(
  userId?: number | null,
  browsingCountry?: string | null,
): string {
  const country = normalizeBoostBrowsingCountry(browsingCountry);
  return `${getBoostViewerTimingKey(userId)}|${country}`;
}

export function boostRotationStorageKey(scopeKey: string): string {
  return `${BOOST_AD_ROTATION_KEY_PREFIX}${scopeKey}`;
}

export function boostCooldownStorageKey(scopeKey: string): string {
  return `${BOOST_AD_COOLDOWN_KEY_PREFIX}${scopeKey}`;
}

export function boostSessionStorageKey(timingKey: string): string {
  return `${BOOST_AD_SESSION_KEY_PREFIX}${timingKey}`;
}

function emptySession(): BoostBrowseSession {
  return {
    accumulatedActiveMs: 0,
    lastActiveTickAt: null,
    deliveryAts: [],
    hasDelivered: false,
  };
}

/** Parse persisted browsing session (tolerant of partial / legacy rows). */
export function parseBoostBrowseSession(raw: string | null): BoostBrowseSession {
  if (!raw) return emptySession();
  try {
    const parsed = JSON.parse(raw) as Partial<BoostBrowseSession>;
    const deliveryAts = Array.isArray(parsed.deliveryAts)
      ? parsed.deliveryAts
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n > 0)
          .sort((a, b) => b - a)
          .slice(0, 20)
      : [];
    return {
      accumulatedActiveMs: Math.max(
        0,
        Number.isFinite(Number(parsed.accumulatedActiveMs))
          ? Number(parsed.accumulatedActiveMs)
          : 0,
      ),
      lastActiveTickAt:
        parsed.lastActiveTickAt != null &&
        Number.isFinite(Number(parsed.lastActiveTickAt))
          ? Number(parsed.lastActiveTickAt)
          : null,
      deliveryAts,
      hasDelivered: !!parsed.hasDelivered || deliveryAts.length > 0,
    };
  } catch {
    return emptySession();
  }
}

export function getBoostBrowseSession(timingKey: string): BoostBrowseSession {
  return parseBoostBrowseSession(safeGet(boostSessionStorageKey(timingKey)));
}

export function writeBoostBrowseSession(
  timingKey: string,
  session: BoostBrowseSession,
): void {
  safeSet(
    boostSessionStorageKey(timingKey),
    JSON.stringify({
      accumulatedActiveMs: Math.max(0, Math.floor(session.accumulatedActiveMs)),
      lastActiveTickAt: session.lastActiveTickAt,
      deliveryAts: session.deliveryAts.slice(0, 20),
      hasDelivered: !!session.hasDelivered,
    } satisfies BoostBrowseSession),
  );
}

/** Required active browsing before the next automatic placement. */
export function requiredBrowsingMsForNextAd(session: BoostBrowseSession): number {
  return session.hasDelivered ? BOOST_AD_INTERVAL_MS : BOOST_AD_FIRST_DELAY_MS;
}

/** Deliveries still inside the rolling 60-minute window. */
export function countRecentBoostDeliveries(
  session: BoostBrowseSession,
  nowMs: number = Date.now(),
): number {
  return session.deliveryAts.filter(
    (t) => nowMs - t < BOOST_AD_ROLLING_WINDOW_MS,
  ).length;
}

/**
 * Whether timer + rolling cap allow an automatic placement attempt.
 * Does not fetch — caller still waits for an eligible creative.
 */
export function canDeliverBoostAd(
  timingKey: string,
  nowMs: number = Date.now(),
): boolean {
  const session = getBoostBrowseSession(timingKey);
  if (countRecentBoostDeliveries(session, nowMs) >= BOOST_AD_ROLLING_CAP) {
    return false;
  }
  return session.accumulatedActiveMs >= requiredBrowsingMsForNextAd(session);
}

/** @deprecated Prefer canDeliverBoostAd — wall-clock cooldown is retired. */
export function shouldShowBoostAd(
  _scopeKey?: string,
  nowMs: number = Date.now(),
  timingKey?: string,
): boolean {
  const key = timingKey ?? (_scopeKey ? _scopeKey.split("|")[0]! : getBoostViewerTimingKey(null));
  return canDeliverBoostAd(key, nowMs);
}

/**
 * Advance the active-browsing accumulator while the marketplace is foregrounded.
 * No-ops while paused (caller should pass active=false when backgrounded/idle/ad).
 */
export function tickBoostBrowsing(
  timingKey: string,
  nowMs: number = Date.now(),
  active: boolean = true,
): BoostBrowseSession {
  const session = getBoostBrowseSession(timingKey);
  if (!active) {
    if (session.lastActiveTickAt != null) {
      session.lastActiveTickAt = null;
      writeBoostBrowseSession(timingKey, session);
    }
    return session;
  }
  if (session.lastActiveTickAt != null && nowMs > session.lastActiveTickAt) {
    const delta = Math.min(nowMs - session.lastActiveTickAt, BOOST_AD_TICK_MS * 5);
    session.accumulatedActiveMs += Math.max(0, delta);
  }
  session.lastActiveTickAt = nowMs;
  writeBoostBrowseSession(timingKey, session);
  return session;
}

/**
 * Mark that an automatic placement was consumed (finished, skipped, dismissed,
 * or interrupted during playback). Starts the 15-minute browsing interval and
 * counts toward the rolling cap. Idempotent within a short window so exposure
 * + dismiss do not double-count.
 */
export function markBoostAdPlacementConsumed(
  timingKey: string,
  atMs: number = Date.now(),
): BoostBrowseSession {
  const session = getBoostBrowseSession(timingKey);
  const newest = session.deliveryAts[0];
  if (newest != null && Math.abs(atMs - newest) < 2_000) {
    return session;
  }
  session.deliveryAts = [atMs, ...session.deliveryAts].slice(0, 20);
  session.hasDelivered = true;
  session.accumulatedActiveMs = 0;
  session.lastActiveTickAt = null;
  writeBoostBrowseSession(timingKey, session);
  // Keep legacy per-scope cooldown keys in sync for older readers.
  safeSet(BOOST_AD_COOLDOWN_KEY, String(atMs));
  return session;
}

/** @deprecated Prefer markBoostAdPlacementConsumed with a timing key. */
export function markBoostAdShown(
  scopeKey?: string,
  atMs: number = Date.now(),
): void {
  const timingKey = scopeKey
    ? scopeKey.split("|")[0]!
    : getBoostViewerTimingKey(null);
  markBoostAdPlacementConsumed(timingKey, atMs);
  if (scopeKey) {
    safeSet(boostCooldownStorageKey(scopeKey), String(atMs));
  }
}

/**
 * Clear only legacy wall-clock cooldown keys. Does NOT reset browsing time or
 * the rolling cap — country switches must keep those.
 */
export function clearBoostAdCooldown(scopeKey?: string): void {
  if (scopeKey) safeRemove(boostCooldownStorageKey(scopeKey));
  safeRemove(BOOST_AD_COOLDOWN_KEY);
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
 * Updates rotation history for this viewer+country scope and consumes the
 * automatic placement for timing/cap purposes. Billing counters stay separate.
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
  const timingKey = scopeKey.split("|")[0]!;
  markBoostAdPlacementConsumed(timingKey, atMs);
  return next;
}

/** Most-recent-first listing ids for the selection API `exclude` soft-rank. */
export function getBoostExcludeIds(scopeKey: string): number[] {
  return getBoostRotationHistory(scopeKey).map((e) => e.id);
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
