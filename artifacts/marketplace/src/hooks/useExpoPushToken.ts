import { useEffect } from "react";
import { useAuth } from "@/contexts/auth";

// PUSH-AUDIT defect #1 (use same-origin API).
// Previous code:
//   const API_BASE = import.meta.env.VITE_API_URL ?? "https://bonjour-tool.replit.app";
// VITE_API_URL was NOT defined in the marketplace build, so every Expo
// token POST silently fell through to the unrelated "bonjour-tool.replit.app"
// Replit instance — which either returned 404 or just dropped the request,
// meaning tokens never reached the production /api/push/expo-token endpoint
// at all. Using a relative URL routes the request through the WebView's
// same-origin (flexamarket.com → DigitalOcean), which is correct in both
// the native app's WebView AND a regular browser session.
const ENDPOINT = "/api/push/expo-token";

// PUSH-AUDIT defect #2 (platform detection).
// The previous code hardcoded `platform: "ios"` for EVERY device, including
// Android. With SafeWebView now sending a UA that contains "iPhone" or
// "Android" (see SafeWebView.tsx userAgent prop), we detect the platform
// from the UA so the value stored in `expo_push_tokens.platform` is
// actually correct and can be used for per-platform targeting / debugging.
function detectPlatform(): "ios" | "android" | "web" {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod|iOS/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "web";
}

async function registerToken(token: string): Promise<void> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        token,
        platform: detectPlatform(),
        // deviceId stays null until the native bridge passes one through —
        // changing the bridge contract is out of scope here.
        deviceId: null,
      }),
    });
    if (!res.ok) {
      // PUSH-AUDIT defect #3 (observability).
      // Previously a `catch {}` swallowed every error including
      // server-side 4xx/5xx, so a misconfigured token registration was
      // completely invisible to operators. We now surface the failure
      // to the browser console at warn level; the call site never
      // throws (push errors must not break unrelated UI).
      // eslint-disable-next-line no-console
      console.warn(
        `[useExpoPushToken] registration failed: HTTP ${res.status} ${res.statusText}`,
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[useExpoPushToken] registration network error:", err);
  }
}

export function useExpoPushToken() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const handleToken = (token: string) => {
      // Defensive: native bridge sometimes fires with empty string before
      // the real token is ready (race between mount and OS fetch).
      if (typeof token !== "string" || token.length === 0) return;
      registerToken(token);
    };

    const w = window as unknown as {
      __expoPushToken?: string;
      __onExpoPushToken?: (t: string) => void;
    };

    // If a token was already injected by SafeWebView's onLoadEnd handler
    // (which fires BEFORE React effects in some race orderings), pick it up
    // synchronously here so we never miss the very first registration.
    if (typeof w.__expoPushToken === "string" && w.__expoPushToken.length > 0) {
      handleToken(w.__expoPushToken);
    }

    // Subsequent native-side token publishes (initial fetch + refresh) fire
    // this callback. SafeWebView calls window.__onExpoPushToken from its
    // injected buildTokenInjectionScript.
    w.__onExpoPushToken = handleToken;

    return () => {
      // Avoid leaking stale closures into the next mount.
      w.__onExpoPushToken = undefined;
    };
  }, [user]);
}
