/**
 * Messages tab — website conversation list in WebView.
 * Tapping a thread opens native /chat/[id]. Back returns to the same list position
 * (tab stays mounted; scroll Y restored from sessionStorage).
 */
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MarketplaceWebView from "@/components/MarketplaceWebView";

export default function InboxTab() {
  if (Platform.OS === "web") {
    return (
      <View style={styles.webFallback}>
        <Text style={styles.webTitle}>Messages (Android WebView inbox)</Text>
        <Text style={styles.webBody}>
          On Android this tab shows the website conversation list. Selecting a
          chat opens the native WhatsApp-style thread.
        </Text>
      </View>
    );
  }

  return <MarketplaceWebView path="/messages" isTabRoot />;
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
