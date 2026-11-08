/** Client helper for recording boost analytics events (fire-and-forget). */

export type BoostClientSource =
  | "promo_feed"
  | "homepage"
  | "product_page"
  | "search"
  | "seller_profile"
  | "shared_link"
  | "dm"
  | "other";

export function detectBoostDevice(): "mobile" | "desktop" | "tablet" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|Android/i.test(ua)) return "mobile";
  return "desktop";
}

export function recordBoostAnalyticsEvent(input: {
  listingId: number;
  type: string;
  source?: BoostClientSource | string;
  token?: string | null;
  watchMs?: number;
  progressMarker?: number;
  searchQuery?: string;
  dedupeKey?: string;
  amountUsd?: number;
}): void {
  if (!input.listingId || !input.type) return;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.token) headers.Authorization = `Bearer ${input.token}`;
  fetch("/api/boost-analytics/events", {
    method: "POST",
    headers,
    body: JSON.stringify({
      listingId: input.listingId,
      type: input.type,
      source: input.source ?? "other",
      device: detectBoostDevice(),
      watchMs: input.watchMs,
      progressMarker: input.progressMarker,
      searchQuery: input.searchQuery,
      dedupeKey: input.dedupeKey,
      amountUsd: input.amountUsd,
    }),
    keepalive: true,
  }).catch(() => {});
}

/** Infer traffic source from the current URL when possible. */
export function inferBoostSourceFromLocation(loc = typeof window !== "undefined" ? window.location.href : ""): BoostClientSource {
  try {
    const u = new URL(loc, typeof window !== "undefined" ? window.location.origin : "https://flexamarket.com");
    const path = u.pathname;
    const ref = u.searchParams.get("ref") || u.searchParams.get("source") || "";
    if (ref === "search" || path.startsWith("/search")) return "search";
    if (ref === "profile" || path.startsWith("/profile/")) return "seller_profile";
    if (ref === "home" || path === "/") return "homepage";
    if (ref === "share" || ref === "shared") return "shared_link";
    if (ref === "dm" || path.startsWith("/messages")) return "dm";
    if (path.startsWith("/videos")) return "promo_feed";
    if (path.startsWith("/listings/")) return "product_page";
    return "other";
  } catch {
    return "other";
  }
}
