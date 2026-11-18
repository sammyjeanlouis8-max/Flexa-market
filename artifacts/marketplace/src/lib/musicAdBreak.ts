/**
 * Flexa Music sponsored ad breaks — song-completion counter + history.
 * Counts only natural song finishes (not skips / previews / abandons).
 */
import {
  getBoostExcludeIds,
  getBoostViewerScopeKey,
  recordBoostPlaybackExposure,
} from "@/lib/boostAdRotation";

export const SONGS_PER_AD = 10;
export const MUSIC_AD_COUNTER_KEY = "flexa_music_completed_songs_v1";
export const MUSIC_AD_HISTORY_KEY = "flexa_music_sponsored_history_v1";
export const MUSIC_AD_BANNER_KEY = "flexa_music_sponsored_banner_v1";
export const MUSIC_AD_FETCH_TIMEOUT_MS = 2500;

export type MusicSponsoredAd = {
  id: number;
  title: string;
  price: number;
  thumbnail: string | null;
  boostVideoUrl: string | null;
  boostImageUrl?: string | null;
  sellerName: string | null;
  sellerId?: number | null;
  boostCtaType: string | null;
  boostExternalLink: string | null;
  boostWhatsappNumber: string | null;
  boostCtaText: string | null;
  status?: string | null;
  isVideoOnly?: boolean;
};

export type MusicSponsoredHistoryItem = {
  /** Stable row id (listingId + heardAt) */
  entryId: string;
  listingId: number;
  title: string;
  sellerName: string | null;
  thumbnail: string | null;
  boostVideoUrl: string;
  heardAt: number;
  background: boolean;
  productPath: string | null;
};

export type AdBreakRequest = {
  hasNextSong: boolean;
  onContinue: () => void;
  ad: MusicSponsoredAd;
};

type AdBreakListener = (req: AdBreakRequest) => void;
type ActiveListener = (active: boolean) => void;

let _adBreakActive = false;
const _listeners = new Set<AdBreakListener>();
const _activeListeners = new Set<ActiveListener>();
let _pendingContinue: (() => void) | null = null;

function musicBoostScopeKey(): string {
  try {
    const raw = localStorage.getItem("flexamarket_user");
    const user = raw ? JSON.parse(raw) : null;
    const id = typeof user?.id === "number" ? user.id : null;
    return getBoostViewerScopeKey(id, null);
  } catch {
    return getBoostViewerScopeKey(null, null);
  }
}

function setActive(on: boolean): void {
  if (_adBreakActive === on) return;
  _adBreakActive = on;
  _activeListeners.forEach((fn) => fn(on));
}

export function isMusicAdBreakActive(): boolean {
  return _adBreakActive;
}

export function subscribeMusicAdBreak(fn: AdBreakListener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function subscribeMusicAdBreakActive(fn: ActiveListener): () => void {
  _activeListeners.add(fn);
  fn(_adBreakActive);
  return () => _activeListeners.delete(fn);
}

export function getCompletedSongCount(): number {
  try {
    const n = Number(localStorage.getItem(MUSIC_AD_COUNTER_KEY) ?? "0");
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function setCompletedSongCount(n: number): void {
  try {
    localStorage.setItem(MUSIC_AD_COUNTER_KEY, String(Math.max(0, Math.floor(n))));
  } catch { /* */ }
}

/** Natural song finish only. Returns the new count. */
export function incrementCompletedSong(): number {
  const next = getCompletedSongCount() + 1;
  setCompletedSongCount(next);
  return next;
}

export function resetCompletedSongCount(): void {
  setCompletedSongCount(0);
}

export function productPathForMusicAd(ad: Pick<MusicSponsoredAd, "id" | "status" | "isVideoOnly">): string | null {
  if (ad.status === "hidden" || ad.isVideoOnly) return null;
  return `/listings/${ad.id}`;
}

export function getSponsoredHistory(): MusicSponsoredHistoryItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(MUSIC_AD_HISTORY_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x: any) => {
        if (!x || typeof x.boostVideoUrl !== "string") return null;
        const listingId = typeof x.listingId === "number" ? x.listingId : x.id;
        if (typeof listingId !== "number") return null;
        const heardAt = typeof x.heardAt === "number" ? x.heardAt : Date.parse(x.heardAt) || 0;
        return {
          entryId: typeof x.entryId === "string" ? x.entryId : `${listingId}-${heardAt}`,
          listingId,
          title: String(x.title ?? "Sponsored"),
          sellerName: x.sellerName ?? null,
          thumbnail: x.thumbnail ?? null,
          boostVideoUrl: x.boostVideoUrl,
          heardAt,
          background: !!x.background,
          productPath: x.productPath ?? null,
        } as MusicSponsoredHistoryItem;
      })
      .filter(Boolean) as MusicSponsoredHistoryItem[];
  } catch {
    return [];
  }
}

export function clearSponsoredHistory(): void {
  try {
    localStorage.removeItem(MUSIC_AD_HISTORY_KEY);
    localStorage.removeItem(MUSIC_AD_BANNER_KEY);
  } catch { /* */ }
}

export function recordSponsoredAdHeard(
  ad: MusicSponsoredAd,
  opts: { background: boolean },
): void {
  if (!ad.boostVideoUrl) return;
  const heardAt = Date.now();
  const item: MusicSponsoredHistoryItem = {
    entryId: `${ad.id}-${heardAt}`,
    listingId: ad.id,
    title: ad.title,
    sellerName: ad.sellerName,
    thumbnail: ad.thumbnail ?? ad.boostImageUrl ?? null,
    boostVideoUrl: ad.boostVideoUrl,
    heardAt,
    background: opts.background,
    productPath: productPathForMusicAd(ad),
  };
  // Deduplicate the same listing within 60s (handoff must not double-count).
  const prev = getSponsoredHistory().filter(
    (x) => !(x.listingId === ad.id && heardAt - x.heardAt < 60_000),
  );
  const next = [item, ...prev].slice(0, 40);
  try {
    localStorage.setItem(MUSIC_AD_HISTORY_KEY, JSON.stringify(next));
    if (opts.background) {
      const banner = Number(localStorage.getItem(MUSIC_AD_BANNER_KEY) ?? "0") || 0;
      localStorage.setItem(MUSIC_AD_BANNER_KEY, String(banner + 1));
    }
  } catch { /* */ }
  recordBoostPlaybackExposure(musicBoostScopeKey(), ad.id);
}

export function getSponsoredBannerCount(): number {
  try {
    const n = Number(localStorage.getItem(MUSIC_AD_BANNER_KEY) ?? "0");
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function dismissSponsoredBanner(): void {
  try {
    localStorage.removeItem(MUSIC_AD_BANNER_KEY);
  } catch { /* */ }
}

export function toPlayableSponsoredUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/api/")) return value;
  if (value.startsWith("/") && !value.startsWith("/objects/")) return value;
  const trimmed = value.startsWith("/objects/") ? value.slice("/objects/".length) : value;
  return `/api/storage/objects/${trimmed}`;
}

export async function fetchEligibleMusicAd(
  timeoutMs = MUSIC_AD_FETCH_TIMEOUT_MS,
): Promise<MusicSponsoredAd | null> {
  const exclude = getBoostExcludeIds(musicBoostScopeKey()).slice(0, 20).join(",");
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({ requireAudio: "1", videoOnly: "1" });
    if (exclude) params.set("exclude", exclude);
    const tk = localStorage.getItem("flexamarket_token");
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
    };
    // Prefer dedicated music endpoint; fall back to boost random-video.
    for (const path of [`/api/music/sponsored-ad?${params}`, `/api/boost/random-video?${params}`]) {
      try {
        const res = await fetch(path, { signal: ctrl.signal, headers });
        if (!res.ok) continue;
        const data = await res.json();
        const listing = data?.listing as MusicSponsoredAd | null;
        const url = toPlayableSponsoredUrl(listing?.boostVideoUrl);
        if (!listing?.id || !url) continue;
        return { ...listing, boostVideoUrl: url };
      } catch {
        /* try next */
      }
    }
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Called after a natural song completion. Returns true if an ad break started
 * (caller must NOT advance the queue — ad UI will call onContinue).
 */
export async function maybeStartMusicAdBreak(opts: {
  hasNextSong: boolean;
  onContinue: () => void;
}): Promise<boolean> {
  if (_adBreakActive) return true;

  // Always count natural completions — including the final song in a queue.
  const count = incrementCompletedSong();
  if (!opts.hasNextSong) {
    // Queue ending — never burn an ad into silence.
    return false;
  }
  if (count < SONGS_PER_AD) return false;

  resetCompletedSongCount();
  const ad = await fetchEligibleMusicAd();
  if (!ad) return false;

  setActive(true);
  _pendingContinue = opts.onContinue;
  if (_listeners.size === 0) {
    // No UI mounted — skip ad rather than stalling playback.
    setActive(false);
    _pendingContinue = null;
    return false;
  }
  _listeners.forEach((fn) => fn({ ...opts, ad }));
  return true;
}

export function finishMusicAdBreak(opts?: { continuePlayback?: boolean }): void {
  const cont = _pendingContinue;
  _pendingContinue = null;
  setActive(false);
  if (opts?.continuePlayback !== false && cont) {
    try {
      cont();
    } catch { /* */ }
  }
}

export function trackMusicAdEvent(
  listingId: number,
  type: "view" | "click" | "skip" | "video_view",
): void {
  try {
    const tk = localStorage.getItem("flexamarket_token");
    void fetch("/api/booster/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
      },
      body: JSON.stringify({ listingId, type, source: "music_ad_break" }),
      keepalive: true,
    });
  } catch { /* */ }
}

/** Pure helpers for unit tests (no localStorage). */
export function shouldTriggerAdBreak(completedCount: number, songsPerAd = SONGS_PER_AD): boolean {
  return completedCount >= songsPerAd;
}
