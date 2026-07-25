/**
 * Browser-side Web Push helpers.
 *
 * Flow:
 *   1. Caller checks isPushSupported().
 *   2. enablePush() registers /sw.js, asks the user for permission,
 *      fetches the VAPID key, calls PushManager.subscribe, and POSTs
 *      the subscription to /api/push/subscribe.
 *   3. disablePush() unsubscribes locally and tells the server to
 *      drop the row.
 *
 * All network calls use the existing token in localStorage.
 */

const TOKEN_KEY = "flexamarket_token";
const DISMISSED_KEY = "flexamarket_push_prompt_dismissed";

function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function authHeader(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

export function isPromptDismissed(): boolean {
  try { return localStorage.getItem(DISMISSED_KEY) === "1"; } catch { return false; }
}

export function dismissPrompt(): void {
  try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* ignore */ }
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  // base path under which the app is served (Vite injects a trailing slash).
  const base = (import.meta as any).env?.BASE_URL || "/";
  const swUrl = `${base}sw.js`.replace(/\/+/g, "/");
  const scope = base.endsWith("/") ? base : base + "/";
  const existing = await navigator.serviceWorker.getRegistration(scope);
  if (existing) return existing;
  return navigator.serviceWorker.register(swUrl, { scope });
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await getServiceWorkerRegistration();
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Request permission, subscribe, and register with the backend.
 * Returns true when the user is fully subscribed at the end.
 */
export async function enablePush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isPushSupported()) return { ok: false, reason: "Browser does not support push notifications." };
  if (!getToken()) return { ok: false, reason: "You must be logged in." };

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return { ok: false, reason: "Notification permission denied." };
  }

  const reg = await getServiceWorkerRegistration();

  // Make sure the SW is active before subscribing.
  if (!reg.active) {
    await new Promise<void>((resolve) => {
      const sw = reg.installing || reg.waiting;
      if (!sw) { resolve(); return; }
      sw.addEventListener("statechange", () => { if (sw.state === "activated") resolve(); });
    });
  }

  // Get VAPID public key from the server.
  const keyRes = await fetch("/api/push/vapid-public-key");
  if (!keyRes.ok) return { ok: false, reason: "Could not fetch VAPID key." };
  const { publicKey } = await keyRes.json() as { publicKey: string };
  if (!publicKey) return { ok: false, reason: "Server returned empty VAPID key." };

  // Reuse existing subscription if one already matches our key, otherwise replace.
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const existingKey = sub.options?.applicationServerKey;
    const sameKey = existingKey ? new Uint8Array(existingKey as ArrayBuffer).every((b, i) =>
      b === urlBase64ToUint8Array(publicKey)[i]) : false;
    if (!sameKey) {
      try { await sub.unsubscribe(); } catch { /* ignore */ }
      sub = null;
    }
  }
  if (!sub) {
    // BufferSource cast — lib.dom expects an ArrayBuffer-typed view, but
    // a Uint8Array is fine at runtime in every browser.
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
    });
  }

  const subJson = sub.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(subJson),
  });
  if (!res.ok) {
    return { ok: false, reason: `Server rejected subscription (${res.status}).` };
  }
  return { ok: true };
}

export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg = await getServiceWorkerRegistration();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    try { await sub.unsubscribe(); } catch { /* ignore */ }
    if (getToken()) {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    }
  } catch { /* ignore */ }
}
