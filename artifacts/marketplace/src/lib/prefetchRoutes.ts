/**
 * Warm high-traffic route chunks after first paint so desktop navigation
 * feels native (no cold Suspense flash on Home → Search → Listing).
 * Does not change URLs, APIs, or auth.
 */

type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };

function whenIdle(run: () => void) {
  const w = window as IdleWindow;
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(run, { timeout: 2500 });
    return;
  }
  window.setTimeout(run, 400);
}

const warmed = new Set<string>();

const ROUTE_IMPORTERS: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/pages/Home"),
  "/search": () => import("@/pages/Search"),
  "/sell": () => import("@/pages/Sell"),
  "/messages": () =>
    Promise.all([
      import("@/pages/Messages"),
      import("@/pages/messages/MessageThread"),
    ]),
  "/wallet": () =>
    Promise.all([
      import("@/pages/Wallet"),
      import("@/pages/wallet/VirtualCardPanel"),
      import("@/pages/wallet/AgentSelectStep"),
    ]),
  "/cart": () => import("@/pages/Cart"),
  "/orders": () => import("@/pages/Orders"),
  "/sales": () => import("@/pages/Sales"),
  "/saved": () => import("@/pages/Saved"),
  "/settings": () => import("@/pages/Settings"),
  "/subscription": () => import("@/pages/Subscription"),
  "/videos": () =>
    Promise.all([
      import("@/pages/VideoDiscover"),
      import("@/pages/VideoFeed"),
    ]),
  "/tv": () => import("@/pages/FlexaTV"),
  "/music": () => import("@/pages/FlexaMusic"),
  "/offers": () => import("@/pages/Offers"),
  "/chatbot": () => import("@/pages/Chatbot"),
  "/jobs": () => import("@/pages/Jobs"),
  "/support": () => import("@/pages/Support"),
  "/admin": () => import("@/pages/Admin"),
  "/my-boosts": () => import("@/pages/MyBoosts"),
};

function normalizePath(href: string): string {
  const path = href.split("?")[0] || "/";
  if (path.startsWith("/listings/") && !path.endsWith("/video")) {
    return "/listings/:id";
  }
  if (path.startsWith("/messages/")) return "/messages";
  if (path.startsWith("/orders/") && path !== "/orders") return "/orders";
  if (path.startsWith("/admin")) return "/admin";
  if (path.startsWith("/settings")) return "/settings";
  if (path.startsWith("/music")) return "/music";
  if (path.startsWith("/tv")) return "/tv";
  if (path.startsWith("/wallet")) return "/wallet";
  return path;
}

/** Prefetch a single route chunk (idempotent). */
export function prefetchRoute(href: string) {
  const key = normalizePath(href);
  if (warmed.has(key)) return;
  const run =
    ROUTE_IMPORTERS[key] ||
    (key === "/listings/:id" ? () => import("@/pages/ListingDetail") : null);
  if (!run) return;
  warmed.add(key);
  void run().catch(() => {
    warmed.delete(key);
  });
}

/** Prefetch the most-used marketplace page modules. Safe to call multiple times. */
export function prefetchCriticalRoutes() {
  whenIdle(() => {
    prefetchRoute("/");
    prefetchRoute("/search");
    prefetchRoute("/listings/:id");
  });
  whenIdle(() => {
    prefetchRoute("/messages");
    prefetchRoute("/wallet");
    prefetchRoute("/cart");
  });
}
