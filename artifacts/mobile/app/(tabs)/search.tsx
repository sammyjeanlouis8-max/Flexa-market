import React, { useRef, useState } from "react";
import { NativeModules, StyleSheet, View } from "react-native";

const WEBSITE = "https://flexamarket.com/search";
const HAS_WEBVIEW = !!(NativeModules.RNCWebView);
let WebView: any = null;
if (HAS_WEBVIEW) { WebView = require("react-native-webview").default; }

export default function SearchTab() {
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
