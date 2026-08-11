/**
 * Flexa Market — bare-minimum WebView shell.
 * No expo-router, no file-based routing.
 * One screen, one WebView, flexamarket.com.
 */
import React, { useRef, useState } from "react";
import { BackHandler, Platform, StyleSheet } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { useEffect } from "react";

const WEBSITE = "https://flexamarket.com";

export default function App() {
  const webRef = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  // Android hardware back
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={styles.container}
        edges={Platform.OS === "ios" ? ["top", "bottom"] : []}
      >
        <WebView
          ref={webRef}
          source={{ uri: WEBSITE }}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          setSupportMultipleWindows={false}
          originWhitelist={["*"]}
          mixedContentMode="always"
          cacheEnabled
          allowsBackForwardNavigationGestures={Platform.OS === "ios"}
          onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  webview: { flex: 1 },
});
