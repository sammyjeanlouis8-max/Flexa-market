/**
 * Record one unique site visit per browser per UTC day.
 * Safe to call on every app mount — server dedupes.
 */

const VISITOR_KEY = "fm_visitor_id";
const PINGED_KEY = "fm_visit_pinged_day";

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function getVisitorKey(): string {
  try {
    let key = localStorage.getItem(VISITOR_KEY);
    if (!key || !/^[a-zA-Z0-9_-]{8,80}$/.test(key)) {
      key =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().replace(/-/g, "")
          : `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(VISITOR_KEY, key);
    }
    return key;
  } catch {
    return `anon${Date.now().toString(36)}`;
  }
}

/** Fire-and-forget unique visit ping. Idempotent within a UTC day. */
export function trackSiteVisit(): void {
  if (typeof window === "undefined") return;
  const day = utcDay();
  try {
    if (sessionStorage.getItem(PINGED_KEY) === day) return;
    sessionStorage.setItem(PINGED_KEY, day);
  } catch {
    /* continue — server still dedupes */
  }

  const visitorKey = getVisitorKey();
  void fetch("/api/analytics/site-visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitorKey }),
    keepalive: true,
  }).catch(() => {});
}
