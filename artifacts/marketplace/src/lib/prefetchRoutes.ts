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

/** Prefetch the most-used marketplace page modules. Safe to call multiple times. */
export function prefetchCriticalRoutes() {
  whenIdle(() => {
    void import("@/pages/Home");
    void import("@/pages/Search");
    void import("@/pages/ListingDetail");
  });
  // Second wave: account chrome users open from the sidebar.
  whenIdle(() => {
    void import("@/pages/Messages");
    void import("@/pages/Wallet");
    void import("@/pages/Cart");
  });
}
