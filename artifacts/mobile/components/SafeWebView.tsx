import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";

const BLOCK_CONTEXT_MENU_SCRIPT = `
(function() {
  if (window.__flexaCtxBlocked) return;
  window.__flexaCtxBlocked = true;
  document.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; }, true);
})();
true;
`;

const INTERNAL_HOSTS = [
  "flexamarket.com",
  "www.flexamarket.com",
  "bonjour-tool.replit.app",
  "stripe.com",
  "checkout.stripe.com",
  "js.stripe.com",
  "hooks.stripe.com",
  "m.stripe.com",
  "m.stripe.network",
];

function isInternal(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return INTERNAL_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h));
  } catch {
    return true;
  }
}

interface SafeWebViewProps {
  uri: string;
  /** Show a native back button header. Default: true. Pass false for tab screens. */
  showBack?: boolean;
}

// SafeAreaView edges:
//   iOS   — "top": content starts below notch / Dynamic Island.
//   Android — "top": content starts below the status bar (needed for the native header).
const SAFE_EDGES: ("top" | "bottom" | "left" | "right")[] = ["top"];

export default function SafeWebView({ uri, showBack = true }: SafeWebViewProps) {
  const router = useRouter();
  const webRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);

  const handleBack = () => {
    if (canGoBack) {
      webRef.current?.goBack();
    } else {
      router.back();
    }
  };

  // Android hardware back button — mirror the same logic
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      return false; // let Expo Router pop the stack
    });
    return () => sub.remove();
  }, [canGoBack]);

  return (
    <SafeAreaView style={styles.container} edges={showBack ? SAFE_EDGES : []}>
      {/* Native back button — only shown for non-tab screens */}
      {showBack && (
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={styles.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Retounen"
          >
            <Feather name="chevron-left" size={26} color="#F97316" />
          </Pressable>
        </View>
      )}

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
        injectedJavaScript={BLOCK_CONTEXT_MENU_SCRIPT}
        injectedJavaScriptForMainFrameOnly
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        allowsBackgroundMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        overScrollMode="never"
        userAgent="FlexaMarket/1.0 (Mobile App)"
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onShouldStartLoadWithRequest={(request) => {
          const url = request.url;
          try {
            const { hostname } = new URL(url);
            if (hostname === "checkout.stripe.com" || hostname.endsWith(".checkout.stripe.com")) {
              setTimeout(() => router.push(`/stripe-checkout?url=${encodeURIComponent(url)}`), 0);
              return false;
            }
          } catch {}
          if (isInternal(url)) return true;
          return false;
        }}
        onOpenWindow={(syntheticEvent) => {
          const targetUrl = (syntheticEvent.nativeEvent as any)?.targetUrl ?? "";
          try {
            const { hostname } = new URL(targetUrl);
            if (hostname === "checkout.stripe.com" || hostname.endsWith(".checkout.stripe.com")) {
              router.push(`/stripe-checkout?url=${encodeURIComponent(targetUrl)}`);
            }
          } catch {}
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
  header: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    backgroundColor: "#0F172A",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1e293b",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  webview: {
    flex: 1,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
});
