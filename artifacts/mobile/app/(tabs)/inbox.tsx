/**
 * Messages tab — website conversation list in WebView.
 * Tapping a thread opens native /chat/[id]. Back returns to the same list position
 * (tab stays mounted; scroll Y restored from sessionStorage).
 */
import React from "react";
import { Platform } from "react-native";
import MarketplaceWebView from "@/components/MarketplaceWebView";
import WebHybridFrame from "@/components/WebHybridFrame";

export default function InboxTab() {
  if (Platform.OS === "web") {
    return <WebHybridFrame path="/messages" />;
  }

  return <MarketplaceWebView path="/messages" isTabRoot />;
}
