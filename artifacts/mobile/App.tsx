/**
 * Flexa Market — WebView shell with Android push notifications.
 *
 * Key behaviors:
 * 1. Push token registration (FCM/APNs) — injected into WebView on load.
 * 2. Cold-start navigation — notification URL captured before WebView loads,
 *    injected in onLoadEnd (fixes the double-tap bug).
 * 3. Background keepalive — when the app goes to background, a periodic
 *    heartbeat is injected into the WebView every 25 s to keep the
 *    socket.io connection alive (Android kills idle WebViews aggressively).
 */
import React, { useCallback, useRef, useState, useEffect } from "react";
import { AppState, AppStateStatus, BackHandler, Platform, StyleSheet } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import * as Notifications from "expo-notifications";
import { usePushNotifications } from "./hooks/usePushNotifications";

const WEBSITE = "https://flexamarket.com";

// Heartbeat interval while app is in background (ms).
const BACKGROUND_HEARTBEAT_MS = 25_000;

/** Register an Expo push token directly from native (bypasses WebView timing). */
async function registerPushTokenDirect(token: string, jwt: string): Promise<void> {
  try {
    const res = await fetch(`${WEBSITE}/api/push/expo-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ token, platform: Platform.OS, deviceId: null }),
    });
    if (!res.ok) {
      console.warn("[push-reg] token save failed:", res.status);
    } else {
      console.log("[push-reg] token saved to DB ✓");
    }
  } catch (e) {
    console.warn("[push-reg] network error:", e);
  }
}

export default function App() {
  const webRef = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // JWT received from the WebView (marketplace sends it via ReactNativeWebView.postMessage)
  const jwtRef = useRef<string | null>(null);

  // Holds an injection script that arrived before the WebView was ready
  const pendingScript = useRef<string | null>(null);

  // URL from a notification that launched the app from a killed state.
  // Stored here, then consumed in onLoadEnd once the WebView is ready.
  const pendingNotifUrl = useRef<string | null>(null);

  // ── Cold-start: notification that launched the app ─────────────────────
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        const url = response.notification.request.content.data?.url as
          | string
          | undefined;
        if (url) pendingNotifUrl.current = url;
      })
      .catch(() => {});
  }, []);

  // ── Background keepalive ───────────────────────────────────────────────
  // When the user switches away from the app, start injecting a heartbeat
  // script every BACKGROUND_HEARTBEAT_MS. The script calls the website's
  // socket keepalive function (if it exists) so the connection stays open.
  // Stop the heartbeat when the app returns to foreground.
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "background") {
        if (heartbeatRef.current) return; // already running
        heartbeatRef.current = setInterval(() => {
          if (!webRef.current) return;
          webRef.current.injectJavaScript(
            `(function(){` +
              // Ping socket.io if present
              `try{if(window.__socket&&window.__socket.connected)window.__socket.emit("heartbeat");}catch(e){}` +
              // Fallback: hit the health endpoint silently so the OS sees network activity
              `try{fetch("/api/health",{method:"GET",cache:"no-store"}).catch(function(){});}catch(e){}` +
            `})();true;`
          );
        }, BACKGROUND_HEARTBEAT_MS);
      } else if (nextState === "active") {
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
      }
    };

    const sub = AppState.addEventListener("change", handleAppState);
    return () => {
      sub.remove();
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, []);

  // ── Push token registration ────────────────────────────────────────────
  const injectJs = useCallback((script: string) => {
    if (webRef.current) {
      webRef.current.injectJavaScript(script);
    } else {
      pendingScript.current = script;
    }
  }, []);

  const tokenRef = usePushNotifications(
    injectJs,
    () => jwtRef.current,
    // Called by usePushNotifications when token arrives and JWT is already known
    (pushToken) => {
      const jwt = jwtRef.current;
      if (jwt) registerPushTokenDirect(pushToken, jwt).catch(() => {});
    },
  );

  // ── onMessage: receive JWT + trigger direct token save ─────────────────
  // The marketplace sends { type: "AUTH_TOKEN", token: jwt } after the user
  // loads.  We store it and, if we already have an Expo push token, call the
  // registration API immediately — no WebView injection timing issues.
  const onMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      if (msg?.type === "AUTH_TOKEN" && typeof msg.token === "string") {
        jwtRef.current = msg.token;
        // If we already have the push token, save it now
        const pushToken = tokenRef.current;
        if (pushToken) {
          registerPushTokenDirect(pushToken, msg.token).catch(() => {});
        }
      }
    } catch {
      // not our message
    }
  }, []);

  // ── Android hardware back button ───────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  // ── onLoadEnd: inject token + handle pending notification URL ──────────
  const onLoadEnd = useCallback(() => {
    // Drain any script that arrived before the page was ready
    if (pendingScript.current) {
      webRef.current?.injectJavaScript(pendingScript.current);
      pendingScript.current = null;
    }

    // Always re-inject the token after each navigation
    const token = tokenRef.current;
    if (token) {
      const platform = Platform.OS;
      webRef.current?.injectJavaScript(
        `(function(){` +
          `window.__expoPushToken=${JSON.stringify(token)};` +
          `window.__expoPushPlatform=${JSON.stringify(platform)};` +
          `if(typeof window.__onExpoPushToken==='function')` +
          `window.__onExpoPushToken(${JSON.stringify(token)},${JSON.stringify(platform)});` +
        `})();true;`
      );
    }

    // Navigate to URL from the notification that cold-started the app.
    // Consumed once — subsequent loads must not re-fire.
    const notifUrl = pendingNotifUrl.current;
    if (notifUrl) {
      pendingNotifUrl.current = null;
      webRef.current?.injectJavaScript(
        `(function(){` +
          `if(typeof window.__handlePushUrl==='function'){` +
            `window.__handlePushUrl(${JSON.stringify(notifUrl)});` +
          `}else{` +
            `window.location.href=${JSON.stringify(notifUrl)};` +
          `}` +
        `})();true;`
      );
    }
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={styles.container}
        edges={Platform.OS === "ios" ? ["top", "bottom"] : []}
      >
        <WebView
          ref={webRef}
          source={{ uri: WEBSITE }}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          setSupportMultipleWindows={false}
          originWhitelist={["*"]}
          mixedContentMode="always"
          cacheEnabled
          allowsBackForwardNavigationGestures={Platform.OS === "ios"}
          onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
          onLoadEnd={onLoadEnd}
          onMessage={onMessage}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  webview: { flex: 1 },
});
