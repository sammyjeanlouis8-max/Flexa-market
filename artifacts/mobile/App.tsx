/**
 * Flexa Market — WebView shell with Android push notifications.
 *
 * Key behaviors:
 * 1. Push token registration (FCM/APNs) — injected into WebView on load.
 * 2. Cold-start navigation — notification URL captured before WebView loads,
 *    injected in onLoadEnd (fixes the double-tap bug).
 * 3. Durable background uploads — trusted WebView requests are handed to a
 *    native WorkManager foreground worker after their file has been staged.
 */
import React, { useCallback, useRef, useState, useEffect } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import * as Notifications from "expo-notifications";
import { usePushNotifications } from "./hooks/usePushNotifications";
import {
  ANDROID_UA_SUFFIX,
  classifyWebUrl,
  isTrustedFlexaUrl,
  platformBridgeScript,
} from "./security/webviewPolicy";
import {
  dispatchFlexaUpload,
  hasNativeBackgroundUploads,
  parseFlexaUploadMessage,
} from "./native/backgroundUploads";

const WEBSITE = "https://flexamarket.com";
const INITIAL_LOAD_TIMEOUT_MS = 20_000;

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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [navigationError, setNavigationError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [webViewInstance, setWebViewInstance] = useState(0);
  const initialPageReadyRef = useRef(false);
  const currentLoadFailedRef = useRef(false);
  const renderProcessGoneRef = useRef(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearErrorTimer = useCallback(() => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = null;
  }, []);
  const clearStartupTimer = useCallback(() => {
    if (startupTimerRef.current) clearTimeout(startupTimerRef.current);
    startupTimerRef.current = null;
  }, []);
  useEffect(() => () => {
    clearErrorTimer();
    clearStartupTimer();
  }, [clearErrorTimer, clearStartupTimer]);
  const currentUrlRef = useRef(WEBSITE);

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

  // ── Push token registration ────────────────────────────────────────────
  const injectJs = useCallback((script: string) => {
    if (webRef.current && isTrustedFlexaUrl(currentUrlRef.current)) {
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

  const emitUploadResult = useCallback((
    requestId: string,
    ok: boolean,
    payload: Record<string, unknown> | string,
  ) => {
    // A response is injected only into the trusted top-level marketplace page.
    // Upload credentials are deliberately never included in native responses.
    if (!webRef.current || !isTrustedFlexaUrl(currentUrlRef.current)) return;
    const detail = ok
      ? { requestId, ok: true, data: payload }
      : { requestId, ok: false, error: String(payload) };
    webRef.current.injectJavaScript(
      `window.dispatchEvent(new CustomEvent("flexa-upload-result",{detail:${JSON.stringify(detail)}}));true;`,
    );
  }, []);

  // ── onMessage: receive JWT + native background-upload bridge ───────────
  // The marketplace sends { type: "AUTH_TOKEN", token: jwt } after the user
  // loads.  We store it and, if we already have an Expo push token, call the
  // registration API immediately — no WebView injection timing issues.
  const onMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    if (!isTrustedFlexaUrl(currentUrlRef.current)) return;
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      if (msg?.type === "AUTH_TOKEN" && typeof msg.token === "string") {
        jwtRef.current = msg.token;
        // If we already have the push token, save it now
        const pushToken = tokenRef.current;
        if (pushToken) {
          registerPushTokenDirect(pushToken, msg.token).catch(() => {});
        }
        return;
      }

      const uploadMessage = parseFlexaUploadMessage(event.nativeEvent.data);
      if (!uploadMessage) return;
      void dispatchFlexaUpload(uploadMessage)
        .then((data) => emitUploadResult(uploadMessage.requestId, true, data))
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Upload request failed";
          emitUploadResult(uploadMessage.requestId, false, message);
        });
    } catch {
      // not our message
    }
  }, [emitUploadResult]);

  // Remount at home after a later page fails. Keep initialPageReadyRef intact
  // so the startup screen cannot return during recovery.
  const recoverHome = useCallback(() => {
    clearErrorTimer();
    clearStartupTimer();
    currentUrlRef.current = WEBSITE;
    currentLoadFailedRef.current = false;
    renderProcessGoneRef.current = false;
    setCanGoBack(false);
    setNavigationError(false);
    setLoadError(false);
    setIsLoading(false);
    setIsRetrying(false);
    setWebViewInstance(value => value + 1);
  }, [clearErrorTimer, clearStartupTimer]);

  const recoverBack = useCallback(() => {
    if (canGoBack && !renderProcessGoneRef.current) {
      // Keep the recovery actions visible until navigation actually changes.
      // goBack can be a no-op after a failed WebView navigation.
      webRef.current?.goBack();
    } else {
      recoverHome();
    }
  }, [canGoBack, recoverHome]);

  // ── Android hardware back button ───────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (navigationError) {
        recoverBack();
        return true;
      }
      if (canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      if (
        initialPageReadyRef.current &&
        isTrustedFlexaUrl(currentUrlRef.current) &&
        currentUrlRef.current !== WEBSITE &&
        currentUrlRef.current !== `${WEBSITE}/`
      ) {
        recoverHome();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack, navigationError, recoverBack, recoverHome]);

  // ── onLoadEnd: inject token + handle pending notification URL ──────────
  const onLoadEnd = useCallback(() => {
    if (!currentLoadFailedRef.current) {
      clearErrorTimer();
      clearStartupTimer();
      initialPageReadyRef.current = true;
      setLoadError(false);
      setNavigationError(false);
      setIsLoading(false);
      setIsRetrying(false);
    }

    // Drain any script that arrived before the page was ready
    if (pendingScript.current && isTrustedFlexaUrl(currentUrlRef.current)) {
      webRef.current?.injectJavaScript(pendingScript.current);
      pendingScript.current = null;
    }

    // Always re-inject the token after each navigation
    const token = tokenRef.current;
    if (token && isTrustedFlexaUrl(currentUrlRef.current)) {
      const platform = Platform.OS;
      webRef.current?.injectJavaScript(
        `(function(){` +
          `try{if(location.protocol!=="https:"||!(location.hostname==="flexamarket.com"||location.hostname.endsWith(".flexamarket.com")))return;}catch(e){return;}` +
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
    if (notifUrl && isTrustedFlexaUrl(notifUrl)) {
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
  }, [clearErrorTimer, clearStartupTimer]);

  const handleLoadStart = useCallback(() => {
    clearErrorTimer();
    currentLoadFailedRef.current = false;
    setLoadError(false);
    if (initialPageReadyRef.current) {
      // Normal in-app navigation must not cover the current page with the
      // full-screen startup view. Slower Android WebViews can emit load-start
      // long before load-end for every tap and redirect.
      setNavigationError(false);
      setIsLoading(false);
      setIsRetrying(false);
      return;
    }
    setIsLoading(true);
    clearStartupTimer();
    startupTimerRef.current = setTimeout(() => {
      startupTimerRef.current = null;
      if (initialPageReadyRef.current) return;
      currentLoadFailedRef.current = true;
      webRef.current?.stopLoading();
      setIsLoading(false);
      setIsRetrying(false);
      setLoadError(true);
    }, INITIAL_LOAD_TIMEOUT_MS);
  }, [clearErrorTimer, clearStartupTimer]);

  const handleLoadProgress = useCallback((event: { nativeEvent: { progress: number } }) => {
    if (
      initialPageReadyRef.current
      || currentLoadFailedRef.current
      || event.nativeEvent.progress < 0.55
    ) {
      return;
    }
    // The first usable document is already visible. Do not keep the native
    // startup screen over it while images and other assets finish loading.
    initialPageReadyRef.current = true;
    clearStartupTimer();
    setIsLoading(false);
    setIsRetrying(false);
  }, [clearStartupTimer]);

  const handleLoadError = useCallback(() => {
    if (currentLoadFailedRef.current) return;
    currentLoadFailedRef.current = true;
    clearStartupTimer();
    clearErrorTimer();
    if (initialPageReadyRef.current) {
      // Keep the last usable marketplace page visible if a later navigation
      // fails instead of replacing the whole app with the startup screen.
      // Offer a native way back even if the WebView rendered a blank error.
      setNavigationError(true);
      setIsLoading(false);
      setIsRetrying(false);
      return;
    }
    setIsLoading(true);
    errorTimerRef.current = setTimeout(() => {
      errorTimerRef.current = null;
      setIsLoading(false);
      setIsRetrying(false);
      setLoadError(true);
    }, 1_200);
  }, [clearErrorTimer, clearStartupTimer]);

  const retryLoad = useCallback(() => {
    clearErrorTimer();
    clearStartupTimer();
    setLoadError(false);
    setIsLoading(true);
    setIsRetrying(true);
    currentLoadFailedRef.current = false;
    if (renderProcessGoneRef.current) {
      renderProcessGoneRef.current = false;
      setWebViewInstance(value => value + 1);
    } else {
      webRef.current?.reload();
    }
  }, [clearErrorTimer, clearStartupTimer]);

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={styles.container}
        // The marketplace WebView owns the bottom safe-area inset itself
        // (the chat composer uses env(safe-area-inset-bottom)). Reserving it
        // here as well shrinks the WebView and leaves a white native strip
        // over the lower half of the composer on iPhone.
        // Android edge-to-edge WebViews need native insets: CSS safe-area
        // values are not a reliable substitute for Android window insets.
        // Side insets also protect the content after rotation on cutout phones.
        edges={Platform.OS === "ios" ? ["top"] : ["top", "bottom", "left", "right"]}
      >
        <WebView
          key={webViewInstance}
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
          applicationNameForUserAgent={
            Platform.OS === "android" ? ANDROID_UA_SUFFIX : undefined
          }
          injectedJavaScriptBeforeContentLoaded={platformBridgeScript(
            Platform.OS,
            hasNativeBackgroundUploads,
          )}
          originWhitelist={["https://*"]}
          mixedContentMode="never"
          cacheEnabled
          cacheMode="LOAD_DEFAULT"
          androidLayerType="hardware"
          renderToHardwareTextureAndroid
          allowsBackForwardNavigationGestures={Platform.OS === "ios"}
          onNavigationStateChange={(s) => {
            if (navigationError && s.url !== currentUrlRef.current) {
              setNavigationError(false);
            }
            currentUrlRef.current = s.url;
            setCanGoBack(s.canGoBack);
          }}
          onLoadStart={(event) => {
            currentUrlRef.current = event.nativeEvent.url;
            handleLoadStart();
          }}
          onLoadProgress={handleLoadProgress}
          onLoadEnd={onLoadEnd}
          renderError={() => <View style={{ flex: 1, backgroundColor: "#fff" }} />}
          onError={(event) => {
            if (Platform.OS === "ios" && event.nativeEvent.code === -999) return;
            if (event.nativeEvent.url && event.nativeEvent.url !== currentUrlRef.current) return;
            handleLoadError();
          }}
          onHttpError={(event) => {
            // Subresource failures must not replace a healthy main document.
            if (event.nativeEvent.url === currentUrlRef.current && event.nativeEvent.statusCode >= 400) handleLoadError();
          }}
          onRenderProcessGone={() => {
            // Android can kill the WebView renderer without onError/onLoadEnd.
            // A dead WebView cannot goBack or reload; only a remount can recover.
            renderProcessGoneRef.current = true;
            clearErrorTimer();
            clearStartupTimer();
            currentLoadFailedRef.current = true;
            setIsLoading(false);
            setIsRetrying(false);
            if (initialPageReadyRef.current) setNavigationError(true);
            else setLoadError(true);
          }}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={(request) => {
            const route = classifyWebUrl(request.url);
            if (route === "moncash" && Platform.OS === "android") {
              Linking.openURL(request.url).catch(() => {});
              return false;
            }
            if (route === "flexa" || route === "stripe" || route === "moncash") return true;
            if (route === "external") Linking.openURL(request.url).catch(() => {});
            return false;
          }}
          onOpenWindow={(event) => {
            const targetUrl = event.nativeEvent.targetUrl;
            const route = classifyWebUrl(targetUrl);
            if (route === "moncash" && Platform.OS === "android") {
              Linking.openURL(targetUrl).catch(() => {});
            } else if (route === "flexa" || route === "stripe" || route === "moncash") {
              webRef.current?.injectJavaScript(
                `window.location.href=${JSON.stringify(targetUrl)};true;`,
              );
            } else if (route === "external") {
              Linking.openURL(targetUrl).catch(() => {});
            }
          }}
        />

        {isLoading && !loadError && (
          <View style={styles.statusScreen} accessibilityLiveRegion="polite">
            <Image
              source={require("./assets/images/icon.png")}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Flexa Market"
            />
            <Text style={styles.brandName}>Flexa Market</Text>
            <ActivityIndicator size="large" color="#F97316" style={styles.loader} />
            <Text style={styles.loadingTitle}>
              We&apos;re getting the marketplace ready for you
            </Text>
            <Text style={styles.loadingMessage}>
              This may take a few seconds if your connection is slow.
            </Text>
          </View>
        )}

        {loadError && (
          <View style={styles.statusScreen} accessibilityLiveRegion="assertive">
            <View style={styles.offlineIcon}>
              <Text style={styles.offlineIconText}>!</Text>
            </View>
            <Text style={styles.errorTitle}>Connection unavailable</Text>
            <Text style={styles.errorMessage}>
              We can't open Flexa Market right now. Check your internet connection and try again.
            </Text>
            <Pressable
              onPress={retryLoad}
              disabled={isRetrying}
              accessibilityRole="button"
              accessibilityLabel="Eseye konekte ankò"
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.retryButtonPressed,
                isRetrying && styles.retryButtonDisabled,
              ]}
            >
              {isRetrying ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.retryButtonText}>Try again</Text>
              )}
            </Pressable>
            <Text style={styles.connectionHint}>
              Wi-Fi oswa done mobil dwe aktive
            </Text>
          </View>
        )}

        {navigationError && !loadError && (
          <View style={styles.navigationRecovery} accessibilityLiveRegion="assertive">
            <Text style={styles.navigationRecoveryText}>
              Paj sa pa chaje. Ou ka retounen oswa ale akèy san fèmen aplikasyon an.
            </Text>
            <View style={styles.navigationRecoveryActions}>
              <Pressable
                onPress={recoverBack}
                accessibilityRole="button"
                style={styles.navigationRecoveryButton}
              >
                <Text style={styles.navigationRecoveryButtonText}>Retounen</Text>
              </Pressable>
              <Pressable
                onPress={recoverHome}
                accessibilityRole="button"
                style={styles.navigationRecoveryButton}
              >
                <Text style={styles.navigationRecoveryButtonText}>Akèy</Text>
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  webview: { flex: 1, backgroundColor: "#F8FAFC" },
  statusScreen: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    backgroundColor: "#F8FAFC",
  },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 22,
  },
  brandName: {
    marginTop: 14,
    color: "#0F172A",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  loader: {
    marginTop: 32,
  },
  loadingTitle: {
    marginTop: 20,
    color: "#1E293B",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  loadingMessage: {
    marginTop: 8,
    maxWidth: 290,
    color: "#64748B",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  offlineIcon: {
    width: 76,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 38,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  offlineIconText: {
    color: "#F97316",
    fontSize: 42,
    fontWeight: "800",
    lineHeight: 48,
  },
  errorTitle: {
    marginTop: 24,
    color: "#0F172A",
    fontSize: 23,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  errorMessage: {
    marginTop: 12,
    maxWidth: 310,
    color: "#475569",
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
  },
  retryButton: {
    minWidth: 190,
    minHeight: 52,
    marginTop: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingHorizontal: 28,
    backgroundColor: "#F97316",
    shadowColor: "#F97316",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 5,
  },
  retryButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  retryButtonDisabled: {
    opacity: 0.72,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  connectionHint: {
    marginTop: 18,
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  navigationRecovery: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    borderRadius: 16,
    backgroundColor: "#0F172A",
    padding: 16,
    elevation: 8,
  },
  navigationRecoveryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  navigationRecoveryActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  navigationRecoveryButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#F97316",
    paddingVertical: 10,
  },
  navigationRecoveryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
