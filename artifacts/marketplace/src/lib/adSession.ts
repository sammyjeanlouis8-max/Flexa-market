/**
 * adSession.ts — Sponsored video ad session tracking & frequency rules.
 *
 * Uses sessionStorage so counters reset automatically when the browser
 * session ends (tab closed / new navigation context).
 * Never touches existing localStorage keys used by the rest of the app.
 */

const SESSION_KEY = "flexamarket_ad_session_v1";

export interface AdSession {
  sessionStart: number;
  listingsViewed: string[];
  searchesPerformed: number;
  adsShown: number;
  adsSkipped: number;
  adsCompleted: number;
  activeMs: number;
  lastActiveAt: number;
}

const DEFAULT: AdSession = {
  sessionStart: Date.now(),
  listingsViewed: [],
  searchesPerformed: 0,
  adsShown: 0,
  adsSkipped: 0,
  adsCompleted: 0,
  activeMs: 0,
  lastActiveAt: Date.now(),
};

function load(): AdSession {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { ...DEFAULT, sessionStart: Date.now(), lastActiveAt: Date.now() };
    return JSON.parse(raw) as AdSession;
  } catch {
    return { ...DEFAULT, sessionStart: Date.now(), lastActiveAt: Date.now() };
  }
}

function save(s: AdSession): void {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* quota */ }
}

function update(fn: (prev: AdSession) => AdSession): void {
  save(fn(load()));
}

export function getSession(): AdSession { return load(); }

export function trackListingViewed(id: string | number): void {
  const sid = String(id);
  update(s => s.listingsViewed.includes(sid) ? s : { ...s, listingsViewed: [...s.listingsViewed, sid] });
}

export function trackSearch(): void {
  update(s => ({ ...s, searchesPerformed: s.searchesPerformed + 1 }));
}

export function trackAdShown(): void {
  update(s => ({ ...s, adsShown: s.adsShown + 1 }));
}

export function trackAdSkipped(): void {
  update(s => ({ ...s, adsSkipped: s.adsSkipped + 1 }));
}

export function trackAdCompleted(): void {
  update(s => ({ ...s, adsCompleted: s.adsCompleted + 1 }));
}

/**
 * Call on any user interaction to accumulate active time.
 * Gap is capped at 60 s to avoid crediting idle time.
 */
export function pingActive(): void {
  update(s => {
    const now = Date.now();
    const gap = Math.min(now - (s.lastActiveAt || now), 60_000);
    return { ...s, activeMs: s.activeMs + gap, lastActiveAt: now };
  });
}

export const MAX_ADS_PER_SESSION = 3;

/**
 * Returns true if ad #adNumber (1-indexed) may show right now.
 *
 * Rule 1 — first ad:   always allowed (timer handles the 15 s delay).
 * Rule 2 — second ad:  ≥10 unique listings viewed OR ≥15 active minutes.
 * Rule 3 — third ad:   ≥20 unique listings viewed.
 */
export function canShowAd(adNumber: 1 | 2 | 3): boolean {
  const s = load();
  if (s.adsShown >= MAX_ADS_PER_SESSION) return false;
  if (s.adsShown !== adNumber - 1) return false;
  const listings   = s.listingsViewed.length;
  const activeMin  = Math.floor(s.activeMs / 60_000);
  if (adNumber === 1) return true;
  if (adNumber === 2) return listings >= 10 || activeMin >= 15;
  if (adNumber === 3) return listings >= 20;
  return false;
}

/** Paths where sponsored ads must not interrupt the user. */
const BLOCKED: RegExp[] = [
  /^\/cart/,
  /^\/checkout/,
  /^\/messages/,
  /^\/sell$/,
  /^\/listings\/new/,
  /^\/listings\/[^/]+\/edit/,
  /^\/boost\//,
  /^\/orders\/[^/]+\/label/,
];

export function isBlockedPath(path: string): boolean {
  return BLOCKED.some(rx => rx.test(path));
}
