import { useLocalSearchParams } from "expo-router";
import React from "react";
import { NativeModules, StyleSheet, View } from "react-native";
let WebView: any = null;
try { WebView = require("react-native-webview").default; } catch (_) {}
const HAS_WEBVIEW = !!WebView;
export default function WebsiteScreen() {
  const { url } = useLocalSearchParams<{ url: string }>();
  const uri = url ? decodeURIComponent(url) : "https://flexamarket.com";
  if (!HAS_WEBVIEW) return null;
  return <View style={styles.c}><WebView source={{ uri }} style={{ flex: 1 }} javaScriptEnabled domStorageEnabled sharedCookiesEnabled thirdPartyCookiesEnabled userAgent="FlexaMarket/1.0 (Mobile App)" /></View>;
}
const styles = StyleSheet.create({ c: { flex: 1 } });
