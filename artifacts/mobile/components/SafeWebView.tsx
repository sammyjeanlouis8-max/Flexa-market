import React from "react";
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

let WebView: any = null;
try {
  WebView = require("react-native-webview").default;
} catch (_) {}

interface IOSRedirectProps {
  icon: string;
  title: string;
  body: string;
  buttonText: string;
  url: string;
  note?: string;
}

interface SafeWebViewProps {
  uri: string;
  iosRedirect?: IOSRedirectProps;
}

function IOSRedirectScreen({ icon, title, body, buttonText, url, note }: IOSRedirectProps) {
  return (
    <View style={styles.iosContainer}>
      <Text style={styles.iosIcon}>{icon}</Text>
      <Text style={styles.iosTitle}>{title}</Text>
      <Text style={styles.iosBody}>{body}</Text>
      <Pressable style={styles.iosButton} onPress={() => Linking.openURL(url)}>
        <Text style={styles.iosButtonText}>{buttonText}</Text>
      </Pressable>
      {note ? <Text style={styles.iosNote}>{note}</Text> : null}
    </View>
  );
}

export default function SafeWebView({ uri, iosRedirect }: SafeWebViewProps) {
  const insets = useSafeAreaInsets();

  if (Platform.OS === "ios" && iosRedirect) {
    return <IOSRedirectScreen {...iosRedirect} />;
  }

  if (!WebView) return null;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <WebView
        source={{ uri }}
        style={{ flex: 1 }}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        contentInsetAdjustmentBehavior="automatic"
        userAgent="FlexaMarket/1.0 (Mobile App)"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  iosContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: "#fff",
  },
  iosIcon: { fontSize: 64, marginBottom: 20 },
  iosTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 16,
    textAlign: "center",
  },
  iosBody: {
    fontSize: 16,
    color: "#475569",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  iosButton: {
    backgroundColor: "#F97316",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 20,
  },
  iosButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  iosNote: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 20,
  },
});
