/**
 * Home tab — Flexa Market website Home in WebView.
 * Native bottom tab bar remains (Messages included). Product Details stay in WebView.
 * Search / cart / checkout navigate to native screens via MarketplaceWebView bridge.
 */
import React from "react";
import { Platform } from "react-native";
import MarketplaceWebView from "@/components/MarketplaceWebView";
import WebHybridFrame from "@/components/WebHybridFrame";

export default function HomeTab() {
  // Expo web cannot host react-native-webview; embed the live site for review.
  if (Platform.OS === "web") {
    return <WebHybridFrame path="/" />;
  }

  return <MarketplaceWebView path="/" isTabRoot />;
}
