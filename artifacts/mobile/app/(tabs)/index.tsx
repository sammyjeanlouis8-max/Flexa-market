/**
 * Home tab — Flexa Market website Home in WebView.
 * Native bottom tab bar remains (Messages included). Product Details stay in WebView.
 * Search / cart / checkout navigate to native screens via MarketplaceWebView bridge.
 */
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MarketplaceWebView from "@/components/MarketplaceWebView";

export default function HomeTab() {
  // Expo web preview cannot host react-native-webview the same way as Android.
  if (Platform.OS === "web") {
    return (
      <View style={styles.webFallback}>
        <Text style={styles.webTitle}>Home (Android WebView)</Text>
        <Text style={styles.webBody}>
          On Android devices this tab loads flexamarket.com Home in a WebView
          with the native bottom bar. Use an Android build / emulator to verify.
        </Text>
      </View>
    );
  }

  return <MarketplaceWebView path="/" isTabRoot />;
}

const styles = StyleSheet.create({
  webFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F8FAFC",
  },
  webTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A", marginBottom: 8 },
  webBody: { fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 20 },
});
