import { useEffect } from "react";
import { useAuth } from "@/contexts/auth";

// Use relative path so it works on any domain (dev + prod).
const API_BASE = "";

function getAuthHeader(): Record<string, string> {
  try {
    const t = localStorage.getItem("flexamarket_token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

async function registerToken(token: string, platform: string) {
  try {
    const res = await fetch(`${API_BASE}/api/push/expo-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      body: JSON.stringify({ token, platform, deviceId: null }),
    });
    if (!res.ok) {
      console.warn("[expo-push] token registration failed:", res.status);
    }
  } catch (err) {
    console.warn("[expo-push] network error:", err);
  }
}

/** Register a raw APNs device token sent by the native Swift iOS app. */
async function registerApnsToken(token: string) {
  try {
    const res = await fetch(`${API_BASE}/api/push/apns-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      console.warn("[apns] token registration failed:", res.status);
      beacon("apns-register-failed", String(res.status));
    } else {
      beacon("apns-register-ok");
    }
  } catch (err) {
    console.warn("[apns] network error:", err);
  }
}

/**
 * Listens for an Expo push token sent by the native WebView wrapper.
 *
 * The native app can deliver the token in two ways:
 *
 *   1. Before the page loads — set `window.__expoPushToken = "<token>"` via
 *      `injectedJavaScriptBeforeContentLoaded` in the WebView props.
 *
 *   2. After the page loads — call
 *      `webViewRef.current.injectJavaScript(
 *        'window.__onExpoPushToken && window.__onExpoPushToken("' + token + '", "ios")' + ';')` 
 *      OR post a message: `window.ReactNativeWebView.postMessage(JSON.stringify({type:"EXPO_PUSH_TOKEN",token:"..."}))`.
 *
 * Registration is deferred until the user is authenticated.
 */
function beacon(stage: string, detail?: string) {
    try {
      fetch(`${API_BASE}/api/push/apns-debug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, detail }),
      });
    } catch { /* ignore */ }
    }

    export function useExpoPushToken() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const handleToken = (token: string, platform?: string) => {
      if (typeof token !== "string" || !token.startsWith("Expo")) return;
      registerToken(token, platform ?? "ios");
    };

    // APNs token handler — raw hex token from native Swift app
    const handleApnsToken = (token: string) => {
      if (typeof token !== "string" || !/^[0-9a-f]{32,}$/i.test(token)) { beacon("apns-token-invalid", String(token).slice(0, 20)); return; }
      beacon("apns-token-received");
      registerApnsToken(token);
    };

    const w = window as any;

    // ── Expo push token (React Native / Expo managed) ──────────────────────
    // Pattern 1: token was injected before React mounted
    if (typeof w.__expoPushToken === "string") {
      handleToken(w.__expoPushToken, w.__expoPushPlatform);
    }
    // Pattern 2: native calls window.__onExpoPushToken(token, platform) after load
    w.__onExpoPushToken = handleToken;

    // ── APNs token (native Swift app) ──────────────────────────────────────
    // Pattern 1: already present before React mounted
    if (typeof w.__apnsToken === "string") {
      handleApnsToken(w.__apnsToken);
    }
    // Pattern 2: Swift app calls window.__onApnsToken(token) after load
    w.__onApnsToken = handleApnsToken;

    // ── iOS native push permission request ─────────────────────────────────
    // When running inside the WKWebView wrapper, the website triggers the
    // native push permission dialog by messaging Swift.  Swift calls
    // UNUserNotificationCenter.requestAuthorization() + registerForRemoteNotifications()
    // and then delivers the APNs token back via window.__onApnsToken above.
    // Native build 83+ handles this message safely (no UNUserNotificationCenter).
    // Delay a few seconds after load to keep app startup untouched.
    if (w.__iosWebView && w.__iosPushBridgeSafe && w.webkit?.messageHandlers?.requestPushPermission) {
      setTimeout(() => {
        try {
          beacon("bridge-posted");
          w.webkit.messageHandlers.requestPushPermission.postMessage({});
        } catch { /* ignore */ }
      }, 3000);
    } else if (w.__iosWebView) {
      // Old native build (< 83): posting the message crashes the app — skip.
      beacon(w.webkit?.messageHandlers?.requestPushPermission ? "bridge-skipped-old-build" : "bridge-missing-handler");
    }

    // Pattern 3: native posts a JSON message via ReactNativeWebView.postMessage
    const onMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "EXPO_PUSH_TOKEN" && typeof data.token === "string") {
          handleToken(data.token, data.platform ?? "ios");
        }
        if (data?.type === "APNS_TOKEN" && typeof data.token === "string") {
          handleApnsToken(data.token);
        }
      } catch { /* not our message */ }
    };
    window.addEventListener("message", onMessage);

    return () => {
      w.__onExpoPushToken = undefined;
      w.__onApnsToken = undefined;
      window.removeEventListener("message", onMessage);
    };
  }, [user]);
}

// redeploy trigger
