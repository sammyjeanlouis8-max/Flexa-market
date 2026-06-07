import { createRoot } from "react-dom/client";
import { Component, type ReactNode } from "react";
import App from "./App";
import "./index.css";
import i18n from "./i18n";

// ── Chunk-error auto-reload (Level 1) ────────────────────────────────────────
// Vite hashes chunk filenames on every build. After a new deploy the old hash
// URLs 404, causing dynamic imports to throw. Catch these *before* React mounts
// so the error boundary never even sees them.
function isChunkError(err: unknown): boolean {
  if (!err) return false;
  const name = (err as any)?.name ?? "";
  const msg  = (err instanceof Error ? err.message : String(err)) ?? "";
  return (
    name === "ChunkLoadError" ||
    // Chrome / Vite / Webpack error messages
    /dynamically imported module|Loading chunk|Failed to fetch dynamically/i.test(msg) ||
    // Safari-specific dynamic-import error messages
    /Importing a module script failed|error loading dynamically imported module/i.test(msg) ||
    // Generic network errors that result from a 404 on the chunk URL
    /Load failed|Failed to load/i.test(msg) ||
    // MIME type errors — server returned HTML (404 page) instead of JS chunk
    /not a valid JavaScript MIME type|MIME type/i.test(msg)
  );
}

const CHUNK_RELOAD_KEY = "fm_chunk_reload";
function autoReloadOnceForChunk() {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return; // already tried once
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    // Clear all caches so the fresh chunks are fetched cleanly
    if ("caches" in window) {
      caches.keys()
        .then((keys: string[]) => Promise.all(keys.map((k) => caches.delete(k))))
        .finally(() => location.reload());
    } else {
      location.reload();
    }
  } catch { location.reload(); }
}

// Clear the one-shot flag on a successful load so the next deploy can still
// trigger a reload.
window.addEventListener("load", () => {
  try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch {}
});

// Level-1a: unhandled promise rejections (dynamic import failures)
window.addEventListener("unhandledrejection", (ev) => {
  if (isChunkError(ev.reason)) { ev.preventDefault(); autoReloadOnceForChunk(); }
});

// Level-1b: synchronous script errors (e.g. <script> tag 404)
window.addEventListener("error", (ev) => {
  if (ev.target instanceof HTMLScriptElement || isChunkError(ev.error)) {
    autoReloadOnceForChunk();
  }
}, true);

// ── Global error boundary (Level 2) ──────────────────────────────────────────
// Catches any unhandled *render* errors that slipped past Level 1.
// One silent retry (catches transient flickers), then immediately show the
// retry button — the user is never stuck staring at a spinner.
const MAX_AUTO_RETRIES = 1;
const RETRY_DELAY_MS   = 600;

interface EBState {
  hasError: boolean; isChunk: boolean;
  retryCount: number; isRetrying: boolean;
}

// ── Minimal fallback shown during error-boundary retries ─────────────────────
// Intentionally invisible — just keeps the white background while the
// error boundary silently retries or triggers a hard reload.
const SplashScreen = ({ showRetry = false, onRetry }: { showRetry?: boolean; onRetry?: () => void }) => {
  // Auto-trigger reload immediately when the retry button would appear,
  // so the user never sees a broken screen at all.
  if (showRetry && onRetry) {
    onRetry();
  }
  return (
    <div style={{
      minHeight: "100dvh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#fff",
    }}>
      <style>{`
        @keyframes _fm_spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        border: "3px solid #e5e7eb", borderTopColor: "#f97316",
        animation: "_fm_spin 0.9s linear infinite",
      }} />
    </div>
  );
};

class GlobalErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, isChunk: false, retryCount: 0, isRetrying: false };
  }

  static getDerivedStateFromError(err: unknown): Partial<EBState> {
    const chunk = isChunkError(err);
    if (chunk) autoReloadOnceForChunk();
    return { hasError: true, isChunk: chunk };
  }

  componentDidCatch(_error: unknown) {
    if (this.state.isChunk) return;
    const { retryCount } = this.state;
    if (retryCount < MAX_AUTO_RETRIES) {
      this.setState({ isRetrying: true });
      this._retryTimer = setTimeout(() => {
        this.setState({ hasError: false, isRetrying: false, retryCount: retryCount + 1 });
      }, RETRY_DELAY_MS);
    } else {
      this.setState({ isRetrying: false });
    }
  }

  componentWillUnmount() {
    if (this._retryTimer) clearTimeout(this._retryTimer);
  }

  private handleManualRetry = () => {
    // Clear all one-shot flags so the next auto-reload can fire if needed,
    // then do a full hard reload to get fresh chunks from the server.
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      sessionStorage.removeItem("fm_just_reloaded");
    } catch {}
    // Full page reload — re-fetches index.html and all chunks fresh from the
    // server, which resolves stale-cache and circular-chunk issues.
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // Auto-retry in progress (non-chunk error) → branded splash, no text
    if (this.state.isRetrying) {
      return <SplashScreen />;
    }

    // Chunk error: reload may or may not have fired (guarded by sessionStorage).
    // Always show the retry button so the user is never silently stuck.
    if (this.state.isChunk) {
      return <SplashScreen showRetry onRetry={this.handleManualRetry} />;
    }

    // All retries exhausted → still branded, subtle retry option
    return <SplashScreen showRetry onRetry={this.handleManualRetry} />;
  }
}

declare const __BUILD_ID__: string;

// Expose JS bundle's build ID on window as early as possible so the inline
// boot script in index.html can compare it against window.__HTML_BUILD_ID__
// and detect a stale-cache mismatch deterministically (rather than waiting
// for the timer-based fallback).
try { (window as any).__JS_BUILD_ID__ = __BUILD_ID__; } catch {}

// ── Global scroll suppression ─────────────────────────────────────────────────
// Ensures 100% user-controlled scrolling. No library, Radix primitive, or
// React component may automatically scroll the page. Three layers of defence:
//
// 1. focus() — always add preventScroll:true so focusing an element never
//    causes the browser to scroll the viewport to reveal it.
(function patchFocus() {
  const orig = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (options?: FocusOptions) {
    orig.call(this, { ...options, preventScroll: true });
  };
})();

// 2. scrollIntoView() — smart guard:
//    • If the element has a real scrollable ancestor (overflow auto/scroll)
//      that is NOT the body/html, allow it but constrain to block:"nearest"
//      so only the minimum scroll happens within the container.
//    • If the only scroll container is the page itself, block the call
//      entirely to prevent any involuntary viewport movement.
(function patchScrollIntoView() {
  const orig = Element.prototype.scrollIntoView;

  function findScrollableAncestor(el: Element): Element | null {
    let p = el.parentElement;
    while (p) {
      if (p === document.body || p === document.documentElement) break;
      const style = window.getComputedStyle(p);
      if (/(auto|scroll)/.test(style.overflowY)) return p;
      p = p.parentElement;
    }
    return null;
  }

  Element.prototype.scrollIntoView = function (
    arg?: boolean | ScrollIntoViewOptions,
  ) {
    // Only scroll if the element sits inside a real scrollable container.
    // Page-level calls (body/html as scroll root) are suppressed completely.
    if (!findScrollableAncestor(this)) return;

    const base: ScrollIntoViewOptions =
      typeof arg === "object" && arg !== null ? arg : {};
    orig.call(this, {
      ...base,
      block: "nearest",
      inline: "nearest",
    });
  };
})();

// 3. window.scrollTo() — intercept and block any programmatic page scroll
//    that isn't the intentional "scroll to top on navigation" call.
//    The App.tsx route-change handler uses scrollTo({top:0}) which is fine;
//    everything else (library internals, scroll restoration, etc.) is blocked.
(function patchWindowScrollTo() {
  const orig = window.scrollTo.bind(window);
  // Allow only explicit scroll-to-top calls (top === 0).
  // Everything else is suppressed.
  const patched: typeof window.scrollTo = function (...args: any[]) {
    const options = args[0];
    if (typeof options === "object" && options !== null) {
      if (options.top === 0 || options.top === undefined) {
        orig(options);
      }
      // Any other top value (scroll restore, etc.) → blocked
      return;
    }
    // scrollTo(x, y) form — only allow if y === 0
    const x = typeof args[0] === "number" ? args[0] : 0;
    const y = typeof args[1] === "number" ? args[1] : 0;
    if (y === 0) orig(x, y);
  } as typeof window.scrollTo;
  window.scrollTo = patched;
})();
// ─────────────────────────────────────────────────────────────────────────────

// Cache-buster: if a different build was previously loaded, force a hard
// reload so the user picks up the latest CSS/JS instead of stale files.
try {
  const KEY = "fm_build_id";
  const prev = localStorage.getItem(KEY);
  if (prev && prev !== __BUILD_ID__ && !sessionStorage.getItem("fm_just_reloaded")) {
    sessionStorage.setItem("fm_just_reloaded", "1");
    localStorage.setItem(KEY, __BUILD_ID__);
    const reload = () => { window.location.reload(); };
    if ("caches" in window) {
      caches.keys().then((keys: string[]) => Promise.all(keys.map((k) => caches.delete(k))))
        .finally(reload);
    } else {
      reload();
    }
  } else {
    localStorage.setItem(KEY, __BUILD_ID__);
  }
} catch {}

console.log("[FLEXA] App started");

const rootEl = document.getElementById("root")!;

const root = createRoot(rootEl);
root.render(
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>,
);

// Remove the static skeleton as soon as React commits its first render.
// CSS rule `#root:not(:empty) + #app-skeleton { display: none }` already
// handles this; the explicit removal frees the DOM nodes.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.getElementById("app-skeleton")?.remove();
  });
});
