/**
 * Flexa Market — WebView shell with Android push notifications.
 * Requests FCM permission on startup, gets Expo push token,
 * and injects it into the WebView so the website can register it.
 *
 * Cold-start fix: when the app is launched by tapping a notification
 * (app was fully killed), getLastNotificationResponseAsync() captures
 * the URL before the WebView has loaded, then onLoadEnd injects it.
 */
import React, { useCallback, useRef, useState, useEffect } from "react";
import { BackHandler, Platform, StyleSheet } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import * as Notifications from "expo-notifications";
import { usePushNotifications } from "./hooks/usePushNotifications";

const WEBSITE = "https://flexamarket.com";

export default function App() {
  const webRef = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  // Holds an injection script that arrived before the WebView was ready
  const pendingScript = useRef<string | null>(null);

  // URL from a notification that launched the app from a killed state.
  // Stored here, then consumed in onLoadEnd once the WebView is ready.
  const pendingNotifUrl = useRef<string | null>(null);

  // On mount: check if the app was launched by tapping a notification
  // while it was completely killed (cold start). If so, stash the URL
  // so onLoadEnd can navigate to it once the WebView finishes loading.
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        const url = response.notification.request.content.data?.url as
          | string
          | undefined;
        if (url) {
          pendingNotifUrl.current = url;
        }
      })
      .catch(() => {});
  }, []);

  // Called by usePushNotifications when the Expo push token is ready.
  // If the WebView is already loaded we inject immediately; otherwise we
  // stash the script and inject it once the page finishes loading.
  const injectJs = useCallback((script: string) => {
    if (webRef.current) {
      webRef.current.injectJavaScript(script);
    } else {
      pendingScript.current = script;
    }
  }, []);

  // Wire up push notification registration (Android FCM + iOS APNs).
  const tokenRef = usePushNotifications(injectJs);

  // Android hardware back button
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

  // Re-inject push token and handle any pending notification URL on every
  // page load, so the website always receives the token and deep-link
  // regardless of navigation order vs. token/notification arrival order.
  const onLoadEnd = useCallback(() => {
    // Drain any script that arrived before the page was ready
    if (pendingScript.current) {
      webRef.current?.injectJavaScript(pendingScript.current);
      pendingScript.current = null;
    }

    // Always re-inject the token after each page navigation
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
    // Consumed once — subsequent loads (user navigating) must not re-fire.
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
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  webview: { flex: 1 },
});
