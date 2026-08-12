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
  // Inside the native iOS WKWebView the Swift layer handles APNs push
  // natively via UNUserNotificationCenter.  Enabling the web-push path here
  // would cause two concurrent requestAuthorization calls — one from JS via
  // Notification.requestPermission(), one from Swift — which crashes iOS.
  // window.__iosWebView is injected by WebViewController's WKUserScript.
  if (typeof window !== "undefined" && (window as any).__iosWebView) return false;
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

// ── Notification sound via Web Audio API ────────────────────────────────────
// Plays a pleasant 2-tone "ding" directly in the browser tab.
// Called from the SW message listener set up by initNotificationSound().
// No audio file needed — synthesised on the fly so it always loads instantly.
function playNotificationSound(): void {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();

    // Resume the context in case browser auto-suspended it (common on Chrome).
    const play = () => {
      // Tone 1: 880 Hz (A5) — sharp attack, fast decay
      const osc1  = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.type = "sine";
      osc1.frequency.value = 880;
      gain1.gain.setValueAtTime(0, ctx.currentTime);
      gain1.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.01);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.2);

      // Tone 2: 1174 Hz (D6) — slightly higher, follows after 120 ms
      const osc2  = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = "sine";
      osc2.frequency.value = 1174;
      gain2.gain.setValueAtTime(0, ctx.currentTime + 0.12);
      gain2.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.13);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.30);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.32);

      osc1.onended = () => { try { ctx.close(); } catch { /* ignore */ } };
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  } catch { /* unsupported — silent fail */ }
}

let _notifSoundInited = false;

/**
 * Call once on app startup (e.g. in App.tsx useEffect).
 * Registers a service-worker message listener so any push notification
 * received while the tab is open triggers the in-page notification sound.
 */
export function initNotificationSound(): void {
  if (_notifSoundInited) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  _notifSoundInited = true;

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event?.data?.type === "FLEXA_PLAY_NOTIFICATION_SOUND") {
      playNotificationSound();
    }
  });
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
