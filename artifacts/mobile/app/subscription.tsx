import React from "react";
import {
  Linking,
  NativeModules,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

let WebView: any = null;
try {
  WebView = require("react-native-webview").default;
} catch (_) {}
const HAS_WEBVIEW = !!WebView;

function IOSSubscriptionScreen() {
  return (
    <View style={styles.iosContainer}>
      <Text style={styles.iosIcon}>👑</Text>
      <Text style={styles.iosTitle}>Subscription Plans</Text>
      <Text style={styles.iosBody}>
        To subscribe or manage your plan, please visit our website. You can
        choose Standard ($15/mo) or Premium ($30/mo) and manage billing there.
      </Text>
      <Pressable
        style={styles.iosButton}
        onPress={() => Linking.openURL("https://flexamarket.com/subscription")}
      >
        <Text style={styles.iosButtonText}>View Plans on Website</Text>
      </Pressable>
      <Text style={styles.iosNote}>
        Your subscription is linked to your account and works across all
        platforms.
      </Text>
    </View>
  );
}

export default function SubscriptionScreen() {
  if (Platform.OS === "ios") {
    return <IOSSubscriptionScreen />;
  }

  if (!HAS_WEBVIEW) return null;

  return (
    <View style={styles.c}>
      <WebView
        source={{ uri: "https://flexamarket.com/subscription" }}
        style={{ flex: 1 }}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        userAgent="FlexaMarket/1.0 (Mobile App)"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1 },
  iosContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: "#fff",
  },
  iosIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
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
  iosButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  iosNote: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 20,
  },
});
