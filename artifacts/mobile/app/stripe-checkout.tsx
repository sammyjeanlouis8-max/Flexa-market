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

// When Stripe redirects back to flexamarket.com the WebView blocks the
// navigation and closes. We do two things:
//  1. Fire the server-side activation so the wallet is credited server-side
//     immediately (idempotent, verified against Stripe).
//  2. Return the card_success params so the caller can navigate to the wallet
//     screen with them — the web Wallet page then polls until balance updates.
function handleFlexaSuccessUrl(url: string): { cardSuccess: boolean; sessionId: string | null; ref: string | null } {
  try {
    const parsed = new URL(url);
    const sessionId = parsed.searchParams.get("session_id");
    const ref       = parsed.searchParams.get("ref");
    const isSuccess = parsed.searchParams.get("card_success") === "1";
    if (isSuccess && sessionId) {
      // Fire activation in background — wallet credit happens server-side
      fetch(
        `https://${FLEXA_HOST}/api/stripe/checkout/activate?session_id=${encodeURIComponent(sessionId)}`,
      ).catch(() => {});
    }
    return { cardSuccess: isSuccess, sessionId, ref };
  } catch {
    return { cardSuccess: false, sessionId: null, ref: null };
  }
}

function isFlexa(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === FLEXA_HOST || hostname.endsWith("." + FLEXA_HOST);
  } catch {
    return false;
  }
}

// Set proper mobile viewport so Stripe's responsive layout matches the rest of the app.
// Do NOT set user-scalable=no — it breaks keyboard-triggered zoom on input fields.
const VIEWPORT_FIX = `
(function() {
  var meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }
  meta.content = 'width=device-width, initial-scale=1.0';
  true;
})();
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

  // Top inset: Dynamic Island / notch height.
  // Bottom inset: home indicator height.
  const topInset = insets.top;
  const bottomInset = Platform.OS === "ios" ? insets.bottom : 0;

  return (
    <View style={[styles.root, { backgroundColor: "#ffffff" }]}>
      {/* Native status-bar background so Dynamic Island area stays white */}
      <View style={[styles.statusBarFill, { height: topInset, backgroundColor: "#ffffff" }]} />

      {/* Native close button — lives in the native layer, always touchable,
          clearly below Dynamic Island / notch, above the WebView content */}
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

      {/* Stripe checkout WebView */}
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
          injectedJavaScript={VIEWPORT_FIX}
          injectedJavaScriptForMainFrameOnly
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onShouldStartLoadWithRequest={(request) => {
            if (isFlexa(request.url)) {
              const { cardSuccess, sessionId } = handleFlexaSuccessUrl(request.url);
              setTimeout(() => {
                if (cardSuccess && sessionId) {
                  // Navigate to wallet with success params so the web page polls balance
                  router.replace({
                    pathname: "/(tabs)/wallet",
                    params: { card_success: "1", session_id: sessionId },
                  } as any);
                } else {
                  router.back();
                }
              }, 0);
              return false;
            }
            return true;
          }}
          onNavigationStateChange={(state) => {
            if (isFlexa(state.url)) {
              const { cardSuccess, sessionId } = handleFlexaSuccessUrl(state.url);
              if (cardSuccess && sessionId) {
                router.replace({
                  pathname: "/(tabs)/wallet",
                  params: { card_success: "1", session_id: sessionId },
                } as any);
              } else {
                router.back();
              }
            }
          }}
        />
      </View>

      {/* Home indicator spacer so Stripe content never hides behind it */}
      {bottomInset > 0 && (
        <View style={{ height: bottomInset, backgroundColor: "#ffffff" }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
