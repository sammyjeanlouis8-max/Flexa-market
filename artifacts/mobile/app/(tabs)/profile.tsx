import React from "react";
import { NativeModules, StyleSheet, View } from "react-native";

const WEBSITE = "https://flexamarket.com/profile";
let WebView: any = null;
try { WebView = require("react-native-webview").default; } catch (_) {}
const HAS_WEBVIEW = !!WebView;

export default function ProfileTab() {
  if (!HAS_WEBVIEW) return null;
  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: WEBSITE }}
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

const styles = StyleSheet.create({ container: { flex: 1 } });
