/**
 * Lightweight connectivity probe — NetInfo is not a dependency.
 * Used by voice outbox to queue when offline and flush when back.
 */
let lastOnline = true;
let lastChecked = 0;

export async function checkOnline(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && now - lastChecked < 2500) return lastOnline;
  lastChecked = now;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch("https://flexamarket.com/api/health", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    lastOnline = res.ok || (res.status >= 200 && res.status < 500);
  } catch {
    // Fallback: try a tiny HEAD to the CDN origin
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      await fetch("https://flexamarket.com/favicon.ico", {
        method: "HEAD",
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      lastOnline = true;
    } catch {
      lastOnline = false;
    }
  }
  return lastOnline;
}

export function getCachedOnline(): boolean {
  return lastOnline;
}

type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();

/** Subscribe to connectivity changes (probe-driven; poll on interval). */
export function subscribeNetwork(listener: Listener): () => void {
  listeners.add(listener);
  listener(lastOnline);
  return () => {
    listeners.delete(listener);
  };
}

function notify(online: boolean) {
  for (const listener of listeners) {
    try {
      listener(online);
    } catch {
      /* ignore */
    }
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startNetworkPolling(intervalMs = 8000): () => void {
  if (pollTimer) return () => {};
  pollTimer = setInterval(() => {
    void checkOnline(true).then((online) => notify(online));
  }, intervalMs);
  return () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  };
}
