import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";

// ─────────────────────────────────────────────────────────────────────────────
// Injected scripts
// ─────────────────────────────────────────────────────────────────────────────

// Blocks the OS context menu on long-press (Samsung surfaces a "Copy URL"
// overlay otherwise). Idempotent.
const BLOCK_CONTEXT_MENU_SCRIPT = `
(function() {
  if (window.__flexaCtxBlocked) return;
  window.__flexaCtxBlocked = true;
  document.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; }, true);
})();
true;
`;

// Builds a one-shot script that exposes the device's native safe-area insets
// as CSS variables on <html>, so the web app can pad fixed headers/footers
// behind the Dynamic Island / notch and the home-indicator without relying
// only on `env(safe-area-inset-*)` (which is unreliable inside RN WebView on
// some iOS versions when the viewport meta lacks `viewport-fit=cover`).
function buildSafeAreaScript(insets: {
  top: number;
  bottom: number;
  left: number;
  right: number;
}): string {
  const t = Math.round(insets.top);
  const b = Math.round(insets.bottom);
  const l = Math.round(insets.left);
  const r = Math.round(insets.right);
  return `(function(){
    try {
      var d = document.documentElement;
      d.classList.add('native-ios');
      var s = d.style;
      s.setProperty('--safe-top', '${t}px');
      s.setProperty('--safe-bottom', '${b}px');
      s.setProperty('--safe-left', '${l}px');
      s.setProperty('--safe-right', '${r}px');
      // Ensure the web app's <meta name=viewport> includes viewport-fit=cover
      // so env(safe-area-inset-*) resolves to real numbers on iOS.
      var m = document.querySelector('meta[name="viewport"]');
      if (m) {
        var c = m.getAttribute('content') || '';
        if (c.indexOf('viewport-fit') === -1) {
          m.setAttribute('content', c + ', viewport-fit=cover');
        }
      }
    } catch (e) {}
  })();
  true;`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Host allowlist
// ─────────────────────────────────────────────────────────────────────────────
//
// Internal hosts stay inside the in-app WebView (no external Safari handoff).
// External hosts are opened in the device browser via Linking.openURL — this
// is REQUIRED by Apple App Store Guideline 4.5/2.5.6 expectations: dead links
// (tap → nothing) are a common reject reason.
const INTERNAL_HOSTS = [
  "flexamarket.com",
  "www.flexamarket.com",
  // EAS-deployed API host (see eas.json env.EXPO_PUBLIC_DOMAIN).
  "lionfish-app-feohg.ondigitalocean.app",
  // Stripe Checkout + JS SDK + 3DS frames + webhooks endpoints used during
  // the in-WebView portion of the payment flow.
  "stripe.com",
  "checkout.stripe.com",
  "js.stripe.com",
  "hooks.stripe.com",
  "m.stripe.com",
  "m.stripe.network",
];

function hostMatches(hostname: string, allow: string[]): boolean {
  return allow.some((h) => hostname === h || hostname.endsWith("." + h));
}

function isInternal(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostMatches(hostname, INTERNAL_HOSTS);
  } catch {
    // Non-http(s) URIs (mailto:, tel:, javascript:, about:, blob:, data:)
    // are treated as "not external HTTP" and handled explicitly below; we
    // return `true` here to keep the historical default of allowing them
    // through the WebView (e.g. data: images, blob: previews).
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface SafeWebViewProps {
  uri: string;
}

// SafeAreaView edges:
//   iOS    — "top" only: positions content below Dynamic Island / notch
//             automatically. Bottom is omitted so the web page's own CSS
//             handles the home-indicator gap (avoiding double padding).
//   Android — no edges: status bar handled by the StatusBar component +
//             the WebView's own content insets.
const SAFE_EDGES: ("top" | "bottom" | "left" | "right")[] =
  Platform.OS === "ios" ? ["top"] : [];

export default function SafeWebView({ uri }: SafeWebViewProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView | null>(null);
  const [loading, setLoading] = useState(true);
  // Tracks whether the WebView currently has back-history. Used to decide
  // whether the Android hardware back button should navigate inside the web
  // app or fall back to the native expo-router stack.
  const canGoBackRef = useRef(false);

  // ── Android: hardware back button → WebView history → expo-router fallback
  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBackRef.current && webRef.current) {
        webRef.current.goBack();
        return true; // we handled it
      }
      return false; // let expo-router pop the stack
    });
    return () => sub.remove();
  }, []);

  // ── External-link handler. Returning false here cancels the WebView load;
  //    we explicitly hand the URL to the OS so it opens in Safari / Chrome.
  const handleExternal = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      // Swallow — if the OS cannot open the URL there is nothing useful we
      // can show; logging would still help diagnostics but not the user.
    });
  }, []);

  // ── Safe-area injection: recomputed when insets change (e.g. rotation or
  //    Dynamic Island visibility changes).
  const safeAreaScript = buildSafeAreaScript(insets);

  return (
    <SafeAreaView style={styles.container} edges={SAFE_EDGES}>
      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      )}
      <WebView
        ref={webRef}
        source={{ uri }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        allowsBackForwardNavigationGestures
        mediaPlaybackRequiresUserAction={false}
        overScrollMode="never"
        // Defer iOS safe-area content insets to the SafeAreaView wrapper;
        // letting WebKit add its own inset would double-pad the top.
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        // Restrict initial navigation to our domains + Stripe; external
        // origins are still possible via onShouldStartLoadWithRequest below.
        originWhitelist={["https://*", "http://*"]}
        injectedJavaScriptBeforeContentLoaded={safeAreaScript}
        injectedJavaScript={BLOCK_CONTEXT_MENU_SCRIPT}
        injectedJavaScriptForMainFrameOnly
        userAgent="FlexaMarket/1.0 (Mobile App)"
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(state) => {
          canGoBackRef.current = !!state.canGoBack;
        }}
        onShouldStartLoadWithRequest={(request) => {
          const url = request.url ?? "";
          // Stripe Checkout → dedicated full-screen native screen (avoids
          // 3DS layout issues + gives us a real Close button).
          try {
            const { hostname, protocol } = new URL(url);
            // Allow non-http(s) URIs (data:, blob:, about:) to load in-place.
            if (protocol !== "http:" && protocol !== "https:") {
              return true;
            }
            if (hostname === "checkout.stripe.com" || hostname.endsWith(".checkout.stripe.com")) {
              setTimeout(
                () => router.push(`/stripe-checkout?url=${encodeURIComponent(url)}`),
                0,
              );
              return false;
            }
            if (hostMatches(hostname, INTERNAL_HOSTS)) {
              return true;
            }
          } catch {
            // Malformed URL — allow the WebView to handle it (will likely error).
            return true;
          }
          // External URL: hand off to the system browser and cancel the
          // in-WebView load. Previously this branch returned `false` with
          // no Linking call, so external links silently did nothing — a
          // common App Store reject pattern.
          handleExternal(url);
          return false;
        }}
        onOpenWindow={(syntheticEvent) => {
          const targetUrl = (syntheticEvent.nativeEvent as any)?.targetUrl ?? "";
          if (!targetUrl) return;
          try {
            const { hostname } = new URL(targetUrl);
            if (hostname === "checkout.stripe.com" || hostname.endsWith(".checkout.stripe.com")) {
              router.push(`/stripe-checkout?url=${encodeURIComponent(targetUrl)}`);
              return;
            }
            if (hostMatches(hostname, INTERNAL_HOSTS)) {
              webRef.current?.injectJavaScript(
                `window.location.assign(${JSON.stringify(targetUrl)});true;`,
              );
              return;
            }
          } catch {}
          // New-window taps for external sites → system browser.
          handleExternal(targetUrl);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
});
