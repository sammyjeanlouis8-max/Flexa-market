import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

export default function SafeWebView({ uri }: SafeWebViewProps) {
  const webRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, Platform.OS === "ios" && { paddingTop: insets.top }]}>
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
          if (isInternal(url)) return true;
          return false;
        }}
      />
    </View>
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
