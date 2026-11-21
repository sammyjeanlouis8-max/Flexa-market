/**
 * Product Details in WebView (opened from native search results).
 * Add-to-cart on the website syncs into the native cart via MarketplaceWebView bridge.
 */
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MarketplaceWebView from "@/components/MarketplaceWebView";

export default function WebViewListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listingId = Array.isArray(id) ? id[0] : id;

  if (Platform.OS === "web") {
    return (
      <View style={styles.webFallback}>
        <Text style={styles.webTitle}>Product Details (WebView)</Text>
        <Text style={styles.webBody}>Listing #{listingId} — Android WebView only.</Text>
      </View>
    );
  }

  return <MarketplaceWebView path={`/listings/${listingId}`} />;
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
  webBody: { fontSize: 14, color: "#64748B", textAlign: "center" },
});
