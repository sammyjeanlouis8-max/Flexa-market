import React from "react";
import { NativeModules, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const HAS_WEBVIEW = !!NativeModules.RNCWebView;
let WebView: any = null;
if (HAS_WEBVIEW) {
  WebView = require("react-native-webview").default;
}

type Insets = { top: number; bottom: number; left: number; right: number };

export function buildSafeAreaJs(insets: Insets) {
  const t = Math.round(insets.top);
  const b = Math.round(insets.bottom);
  const l = Math.round(insets.left);
  const r = Math.round(insets.right);
  return `(function(){try{var d=document.documentElement;d.classList.add('native-ios');var s=d.style;s.setProperty('--safe-top','${t}px');s.setProperty('--safe-bottom','${b}px');s.setProperty('--safe-left','${l}px');s.setProperty('--safe-right','${r}px');}catch(e){}})();true;`;
}

export default function SiteWebView({
  uri,
  ...rest
}: {
  uri: string;
  [key: string]: any;
}) {
  const insets = useSafeAreaInsets();
  if (!HAS_WEBVIEW) return null;
  const js = buildSafeAreaJs(insets);
  return (
    <View style={styles.c}>
      <WebView
        source={{ uri }}
        style={{ flex: 1 }}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        injectedJavaScriptBeforeContentLoaded={js}
        userAgent="FlexaMarket/1.0 (Mobile App)"
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({ c: { flex: 1 } });
