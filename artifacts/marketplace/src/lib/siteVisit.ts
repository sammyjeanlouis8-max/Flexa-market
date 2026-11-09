/**
 * Privacy-conscious visitor + session tracking.
 *
 * - Opaque visitor id in localStorage (unique visitor / UTC day — server dedupes)
 * - Opaque session id in sessionStorage (refreshes do NOT create a new unique visitor)
 * - Guests and registered users are both counted
 * - No raw IP stored client-side; country inferred server-side from CF when available
 */

const VISITOR_KEY = "fm_visitor_id";
const SESSION_KEY = "fm_session_id";
const SESSION_STARTED_KEY = "fm_session_started_at";
const LAST_PATH_KEY = "fm_last_tracked_path";
const HEARTBEAT_MS = 60_000;
const SESSION_IDLE_MS = 30 * 60_000; // 30 minutes → new session

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function randomId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function getVisitorKey(): string {
  try {
    let key = localStorage.getItem(VISITOR_KEY);
    if (!key || !/^[a-zA-Z0-9_-]{8,80}$/.test(key)) {
      key = randomId("v");
      localStorage.setItem(VISITOR_KEY, key);
    }
    return key;
  } catch {
    return randomId("anon");
  }
}

function getSessionId(): string {
  try {
    const started = Number(sessionStorage.getItem(SESSION_STARTED_KEY) || "0");
    const idle = Date.now() - started > SESSION_IDLE_MS;
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid || !/^[a-zA-Z0-9_-]{8,80}$/.test(sid) || idle) {
      sid = randomId("s");
      sessionStorage.setItem(SESSION_KEY, sid);
      sessionStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
    } else {
      sessionStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
    }
    return sid;
  } catch {
    return randomId("s");
  }
}

function detectDevice(): "mobile" | "tablet" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "mobile";
  return "desktop";
}

function detectSource(): string {
  try {
    const ref = document.referrer || "";
    if (!ref) return "direct";
    const host = new URL(ref).hostname.replace(/^www\./, "");
    const self = window.location.hostname.replace(/^www\./, "");
    if (host === self) return "direct";
    if (/google|bing|yahoo|duckduckgo|baidu/i.test(host)) return "organic";
    if (/facebook|instagram|twitter|x\.com|tiktok|linkedin|whatsapp|t\.co/i.test(host)) return "social";
    return "referral";
  } catch {
    return "direct";
  }
}

type TrackEvent = "visit" | "pageview" | "heartbeat";

function sendBeacon(event: TrackEvent, path?: string): void {
  if (typeof window === "undefined") return;
  const visitorKey = getVisitorKey();
  const sessionId = getSessionId();
  const body = JSON.stringify({
    visitorKey,
    sessionId,
    event,
    path: (path || window.location.pathname || "/").split("?")[0].slice(0, 200),
    device: detectDevice(),
    source: detectSource(),
    day: utcDay(),
  });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const token = localStorage.getItem("flexamarket_token");
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch { /* ok */ }

  void fetch("/api/analytics/site-visit", {
    method: "POST",
    headers,
    body,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => {});
}

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function ensureHeartbeat(): void {
  if (heartbeatTimer || typeof window === "undefined") return;
  heartbeatTimer = setInterval(() => {
    if (document.visibilityState === "hidden") return;
    sendBeacon("heartbeat");
  }, HEARTBEAT_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sendBeacon("heartbeat");
  });
}

/** Fire once on app mount — unique visitor + session start. */
export function trackSiteVisit(): void {
  if (typeof window === "undefined") return;
  sendBeacon("visit");
  ensureHeartbeat();
}

/** Track SPA navigations as page views (does not create a new unique visitor). */
export function trackPageView(path?: string): void {
  if (typeof window === "undefined") return;
  const p = (path || window.location.pathname || "/").split("?")[0];
  try {
    if (sessionStorage.getItem(LAST_PATH_KEY) === p) return;
    sessionStorage.setItem(LAST_PATH_KEY, p);
  } catch { /* continue */ }
  sendBeacon("pageview", p);
  ensureHeartbeat();
}
