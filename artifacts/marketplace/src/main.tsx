import { createRoot } from "react-dom/client";
import { Component, type ReactNode } from "react";
import App from "./App";
import "./index.css";
import i18n from "./i18n";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getCurrentSessionToken } from "@/lib/sessionToken";
import { isChunkError } from "@/lib/chunkError";

setAuthTokenGetter(getCurrentSessionToken);

// ── Chunk-error auto-reload (Level 1) ────────────────────────────────────────
// A removed Vite chunk needs a fresh document. Unrelated API/media load errors
// must never restart an installed Android WebView.
const CHUNK_RELOAD_KEY = "fm_chunk_reload";
let chunkReloadPending = false;
function autoReloadOnceForChunk(): boolean {
  if (chunkReloadPending) return true;
  try {
    const previous = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - previous < 60_000) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    chunkReloadPending = true;
    // index.html is served no-store and hashed assets are immutable. Cache
    // Storage has no fetch handler here, so deleting every cache adds delay
    // without helping this navigation recover.
    setTimeout(() => location.reload(), 0);
    return true;
  } catch {
    // Without a persistent guard, auto-reloading could loop indefinitely.
    return false;
  }
}

// Level-1a: unhandled promise rejections (dynamic import failures)
window.addEventListener("unhandledrejection", (ev) => {
  if (isChunkError(ev.reason)) { ev.preventDefault(); autoReloadOnceForChunk(); }
});

// Level-1b: synchronous script errors (e.g. <script> tag 404)
window.addEventListener("error", (ev) => {
  const script = ev.target instanceof HTMLScriptElement ? ev.target : null;
  const scriptUrl = script?.src ? new URL(script.src, location.href) : null;
  const failedAppScript = !!scriptUrl &&
    scriptUrl.origin === location.origin &&
    /\/assets\/[^/]+\.js$/.test(scriptUrl.pathname);
  if (failedAppScript || isChunkError(ev.error)) {
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
  lastError: string | null;
}

// ── Minimal fallback shown during error-boundary retries ─────────────────────
// Intentionally invisible — just keeps the white background while the
// error boundary silently retries or triggers a hard reload.
const SplashScreen = ({ showRetry = false, onRetry }: { showRetry?: boolean; onRetry?: () => void }) => {
  // When there's nothing to recover from, show only a subtle spinner.
  // IMPORTANT: never auto-call onRetry here. Auto-reloading from the fallback
  // can create a reload loop if the underlying error persists — the user must
  // stay in control. Chunk errors already get ONE guarded auto-reload from
  // getDerivedStateFromError; if that didn't resolve it, we show a manual button.
  if (!showRetry) {
    return (
      <div style={{
        minHeight: "100dvh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#fff",
      }}>
        <style>{`@keyframes _fm_spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          border: "3px solid #e5e7eb", borderTopColor: "#f97316",
          animation: "_fm_spin 0.9s linear infinite",
        }} />
      </div>
    );
  }

  // Recovery copy stays English independently of the selected app language.
  const errorMsg = "There was a problem loading the page.";
  const retryLabel = "Try again";

  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: "#fff",
      gap: 18, padding: 24, textAlign: "center",
    }}>
      <p style={{ color: "#374151", fontSize: 15, margin: 0, maxWidth: 320 }}>
        {errorMsg}
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          background: "#f97316", color: "#fff", border: "none",
          borderRadius: 9999, padding: "12px 28px", fontSize: 15,
          fontWeight: 600, cursor: "pointer",
        }}
      >
        {retryLabel}
      </button>
    </div>
  );
};

class GlobalErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, isChunk: false, retryCount: 0, isRetrying: false, lastError: null };
  }

  static getDerivedStateFromError(err: unknown): Partial<EBState> {
    const chunk = isChunkError(err);
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    // Start in recovery on the FIRST fallback render, not only in didCatch.
    return { hasError: true, isChunk: chunk, isRetrying: true, lastError: msg };
  }

  componentDidCatch(error: unknown) {
    console.error("[GlobalErrorBoundary] caught:", error);
    if (this._retryTimer) clearTimeout(this._retryTimer);
    if (this.state.isChunk) {
      if (autoReloadOnceForChunk()) {
        this._retryTimer = setTimeout(() => this.setState({ isRetrying: false }), 8_000);
      } else {
        this.setState({ isRetrying: false });
      }
      return;
    }
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

    // All retries exhausted → show error detail for debugging
    return (
      <>
        <SplashScreen showRetry onRetry={this.handleManualRetry} />
        {import.meta.env.DEV && this.state.lastError && (
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0,
            background: "#1e1e1e", color: "#f87171", fontSize: 11,
            padding: "8px 12px", fontFamily: "monospace", zIndex: 99999,
            wordBreak: "break-all", maxHeight: 120, overflowY: "auto",
          }}>
            {this.state.lastError}
          </div>
        )}
      </>
    );
  }
}


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
