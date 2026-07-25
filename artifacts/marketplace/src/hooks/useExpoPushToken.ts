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
export function useExpoPushToken() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const handleToken = (token: string, platform?: string) => {
      if (typeof token !== "string" || !token.startsWith("Expo")) return;
      registerToken(token, platform ?? "ios");
    };

    const w = window as any;

    // Pattern 1: token was injected before React mounted
    if (typeof w.__expoPushToken === "string") {
      handleToken(w.__expoPushToken, w.__expoPushPlatform);
    }

    // Pattern 2: native calls window.__onExpoPushToken(token, platform) after load
    w.__onExpoPushToken = handleToken;

    // Pattern 3: native posts a JSON message via ReactNativeWebView.postMessage
    const onMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "EXPO_PUSH_TOKEN" && typeof data.token === "string") {
          handleToken(data.token, data.platform ?? "ios");
        }
      } catch { /* not our message */ }
    };
    window.addEventListener("message", onMessage);

    return () => {
      w.__onExpoPushToken = undefined;
      window.removeEventListener("message", onMessage);
    };
  }, [user]);
}
