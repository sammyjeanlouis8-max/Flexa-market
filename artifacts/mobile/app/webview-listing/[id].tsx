/**
 * Product Details in WebView (opened from native search results).
 * Add-to-cart on the website syncs into the native cart via MarketplaceWebView bridge.
 */
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import MarketplaceWebView from "@/components/MarketplaceWebView";
import WebHybridFrame from "@/components/WebHybridFrame";

export default function WebViewListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listingId = Array.isArray(id) ? id[0] : id;

  if (Platform.OS === "web") {
    return <WebHybridFrame path={`/listings/${listingId}`} />;
  }

  return <MarketplaceWebView path={`/listings/${listingId}`} />;
}
