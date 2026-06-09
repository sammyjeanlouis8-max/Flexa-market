import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";

const FLEXA_HOST = "flexamarket.com";

function isFlexa(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === FLEXA_HOST || hostname.endsWith("." + FLEXA_HOST);
  } catch {
    return false;
  }
}

// ─── Viewport fix ─────────────────────────────────────────────────────────────
// Applied at TWO injection points:
//
//   1. injectedJavaScriptBeforeContentLoaded  — fires in the WKUserScript
//      pre-navigation phase, before Stripe's HTML has been parsed. At this
//      point document.head may not yet exist, so we wait for DOMContentLoaded
//      while also attempting an immediate call (harmless if head is absent).
//
//   2. injectedJavaScript  — fires after the page's load event. Stripe's boot
//      JS sometimes rewrites the viewport meta after DOMContentLoaded, so a
//      second pass ensures our settings always win.
//
// WHY maximum-scale=1.0:
//   iOS Safari (WKWebView) auto-zooms the viewport when any focusable input
//   (email, card number, CVC …) has a computed font-size < 16 px. Stripe's
//   hosted Checkout page uses ~14–15 px labels. Without maximum-scale the
//   entire WebView enlarges on first tap and never resets — producing the
//   "excessive zoom" symptom reported by users.
//
// WHY viewport-fit=cover:
//   Without it, env(safe-area-inset-*) resolves to 0 inside WKWebView on
//   devices with a Dynamic Island / notch, causing Stripe's sticky footer
//   to hide behind the home indicator.
const VIEWPORT_FIX_SCRIPT = `
(function () {
  function applyViewport() {
    var m = document.querySelector('meta[name="viewport"]');
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute('name', 'viewport');
      var target = document.head || document.documentElement;
      if (target) target.appendChild(m);
    }
    if (m) {
      m.setAttribute(
        'content',
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover'
      );
    }
  }
  // Immediate attempt — succeeds after DOMContentLoaded or if head already exists.
  applyViewport();
  // Guard for very early injection (before <head> is parsed).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyViewport, { once: true });
  }
  // Final pass after all scripts run — in case Stripe's boot JS resets the meta.
  window.addEventListener('load', applyViewport, { once: true });
})();
true;
`.trim();

export default function StripeCheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { url } = useLocalSearchParams<{ url: string }>();
  const webRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);

  const stripeUrl = typeof url === "string" ? url : null;

  if (!stripeUrl) {
    router.back();
    return null;
  }

  // Derive safe-area dimensions.
  // Top  → Dynamic Island / notch height.
  // Bottom → home indicator height (iOS only; Android handles this via system UI).
  const topInset    = insets.top;
  const bottomInset = Platform.OS === "ios" ? insets.bottom : 0;

  return (
    <View style={styles.root}>
      {/* ── Status bar background ──────────────────────────────────────────────
          Fills the Dynamic Island / notch area with white so the WebView
          content never bleeds behind the camera cutout.
          Position: absolute so it does not affect the flex layout below. */}
      <View
        style={[
          styles.statusBarFill,
          { height: topInset, backgroundColor: "#ffffff" },
        ]}
      />

      {/* ── Native close button ────────────────────────────────────────────────
          Lives in the native layer, always touchable regardless of WebView
          state. marginTop pushes it below the notch / Dynamic Island.
          zIndex: 20 keeps it above the absolute statusBarFill (z:10). */}
      <View style={[styles.closeRow, { marginTop: topInset }]}>
        <Pressable
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          onPress={() => router.back()}
          style={styles.closeBtn}
          accessibilityLabel="Fèmè peman an"
          accessibilityRole="button"
        >
          <Feather name="x" size={22} color="#111827" />
        </Pressable>
      </View>

      {/* ── Stripe Checkout WebView ────────────────────────────────────────────
          Key viewport / zoom props:
            scalesPageToFit={false}   — disables WKWebView's built-in
                                        "shrink to fit" scaling pass that
                                        can double-scale with our viewport fix.
            injectedJavaScriptBeforeContentLoaded
                                      — applies the viewport meta before
                                        Stripe's HTML is parsed; prevents the
                                        initial-render zoom flash.
            injectedJavaScript        — second-pass after load event in case
                                        Stripe's boot JS resets the meta. */}
      <View style={styles.webviewContainer}>
        {loading && (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#F97316" />
          </View>
        )}
        <WebView
          ref={webRef}
          source={{ uri: stripeUrl }}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          overScrollMode="never"
          scalesPageToFit={false}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          injectedJavaScriptBeforeContentLoaded={VIEWPORT_FIX_SCRIPT}
          injectedJavaScript={VIEWPORT_FIX_SCRIPT}
          injectedJavaScriptForMainFrameOnly
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onShouldStartLoadWithRequest={(request) => {
            if (isFlexa(request.url)) {
              setTimeout(() => router.back(), 0);
              return false;
            }
            return true;
          }}
          onNavigationStateChange={(state) => {
            if (isFlexa(state.url)) {
              router.back();
            }
          }}
          onContentProcessDidTerminate={() => {
            try { webRef.current?.reload(); } catch { /* noop */ }
          }}
        />
      </View>

      {/* ── Home indicator spacer ─────────────────────────────────────────────
          Prevents Stripe's "Subscribe" button from being hidden behind the
          iOS home indicator gesture bar. */}
      {bottomInset > 0 && (
        <View style={{ height: bottomInset, backgroundColor: "#ffffff" }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  statusBarFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  closeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 20,
    backgroundColor: "#ffffff",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  webviewContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webview: {
    flex: 1,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
});
