import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";

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
}

// SafeAreaView edges:
//   iOS   — "top" only: positions content below Dynamic Island / notch automatically.
//            "bottom" is omitted so the web page's own CSS (env(safe-area-inset-bottom))
//            handles the home-indicator gap — adding native bottom padding would double it.
//   Android — no edges: the OS + web page manage the status bar independently.
const SAFE_EDGES: ("top" | "bottom" | "left" | "right")[] =
  Platform.OS === "ios" ? ["top"] : [];

export default function SafeWebView({ uri }: SafeWebViewProps) {
  const router = useRouter();
  const webRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);

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
        mediaPlaybackRequiresUserAction={false}
        overScrollMode="never"
        userAgent="FlexaMarket/1.0 (Mobile App)"
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
