import React from "react";
import { NativeModules, StyleSheet, View } from "react-native";
const HAS_WEBVIEW = !!(NativeModules.RNCWebView);
let WebView: any = null;
if (HAS_WEBVIEW) { WebView = require("react-native-webview").default; }
export default function SettingsScreen() {
  if (!HAS_WEBVIEW) return null;
  return <View style={styles.c}><WebView source={{ uri: "https://flexamarket.com/settings" }} style={{ flex: 1 }} javaScriptEnabled domStorageEnabled sharedCookiesEnabled thirdPartyCookiesEnabled userAgent="FlexaMarket/1.0 (Mobile App)" /></View>;
}
const styles = StyleSheet.create({ c: { flex: 1 } });
