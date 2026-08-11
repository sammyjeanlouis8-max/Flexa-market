/**
 * Ultra-minimal WebView shell — no push notifications, no camera/file bridge.
 * Used for build 60 to isolate the iOS startup crash.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Linking, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";

const WEBSITE = "https://flexamarket.com";

function isInternal(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol === "mailto:" || protocol === "tel:" || protocol === "sms:") return false;
    if (hostname === "flexamarket.com" || hostname.endsWith(".flexamarket.com")) return true;
    if (hostname === "stripe.com" || hostname.endsWith(".stripe.com") || hostname.endsWith(".stripe.network")) return true;
    return false;
  } catch {
    return true;
  }
}

const SAFE_EDGES: ("top" | "bottom" | "left" | "right")[] =
  Platform.OS === "ios" ? ["top", "bottom"] : [];

export default function HomeTab() {
  const webRef = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const insets = useSafeAreaInsets();

  // Android hardware back
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) { webRef.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  // Inject safe-area CSS variables on every page load
  const onLoadEnd = useCallback(() => {
    webRef.current?.injectJavaScript(
      `(function(){
        document.documentElement.style.setProperty('--sat','${Math.round(insets.top)}px');
        document.documentElement.style.setProperty('--sab','${Math.round(insets.bottom)}px');
      })();true;`
    );
  }, [insets]);

  const onShouldStartLoadWithRequest = useCallback((req: any) => {
    if (isInternal(req.url)) return true;
    Linking.openURL(req.url).catch(() => {});
    return false;
  }, []);

  const onOpenWindow = useCallback((event: any) => {
    const url = event.nativeEvent?.targetUrl;
    if (!url) return;
    if (isInternal(url)) {
      webRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(url)};true;`);
    } else {
      Linking.openURL(url).catch(() => {});
    }
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }} edges={SAFE_EDGES}>
      <WebView
        ref={webRef}
        source={{ uri: WEBSITE }}
        style={{ flex: 1 }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        allowsBackForwardNavigationGestures={Platform.OS === "ios"}
        setSupportMultipleWindows={false}
        applicationNameForUserAgent="FlexaMarket/1.0 Safari/605.1.15"
        originWhitelist={["*"]}
        startInLoadingState
        cacheEnabled
        onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onOpenWindow={onOpenWindow}
        onLoadEnd={onLoadEnd}
      />
    </SafeAreaView>
  );
}
