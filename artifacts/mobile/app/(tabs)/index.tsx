import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, BackHandler, NativeModules, Platform,
  Pressable, StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const WEBSITE = "https://flexamarket.com";

const HAS_WEBVIEW = !!(NativeModules.RNCWebView);
let WebView: any = null;
if (HAS_WEBVIEW) {
  WebView = require("react-native-webview").default;
}

export default function HomeTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  if (!HAS_WEBVIEW) {
    return <FallbackHome colors={colors} insets={insets} token={token} />;
  }
  return <EmbeddedHome colors={colors} insets={insets} token={token} />;
}

// ─── Full embedded WebView (after native build) ───────────────────────────────
function EmbeddedHome({ colors, insets, token }: any) {
  const webRef = useRef<any>(null);
  const [navState, setNavState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [offline, setOffline] = useState(false);

  const canGoBack = navState?.canGoBack ?? false;

  const injectedJS = `
    (function() {
      try {
        ${token ? `localStorage.setItem('fm_token', ${JSON.stringify(token)});
        localStorage.setItem('auth_token', ${JSON.stringify(token)});` : ""}
        localStorage.setItem('is_native_app', 'true');
        window.isNativeApp = true;
      } catch(e) {}
    })();
    true;
  `;

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) { webRef.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  if (offline) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ fontSize: 56 }}>📡</Text>
        <Text style={[styles.offlineTitle, { color: colors.foreground }]}>Pa gen entènèt</Text>
        <Text style={[styles.offlineSub, { color: colors.mutedForeground }]}>Verifye koneksyon ou epi eseye ankò.</Text>
        <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          onPress={() => { setOffline(false); setLoading(true); webRef.current?.reload(); }}>
          <Feather name="refresh-cw" size={16} color="#fff" />
          <Text style={styles.retryText}>Eseye Ankò</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {loading && (
        <View style={[styles.progressTrack, { backgroundColor: colors.border, top: insets.top }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${Math.round(progress * 100)}%` as any }]} />
        </View>
      )}
      <WebView
        ref={webRef}
        source={{ uri: WEBSITE }}
        style={{ flex: 1 }}
        injectedJavaScript={injectedJS}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        overScrollMode="never"
        onNavigationStateChange={setNavState}
        onLoadStart={() => { setLoading(true); setOffline(false); }}
        onLoadEnd={() => setLoading(false)}
        onLoadProgress={({ nativeEvent }: any) => setProgress(nativeEvent.progress)}
        onError={() => { setOffline(true); setLoading(false); }}
        onHttpError={({ nativeEvent }: any) => { if (nativeEvent.statusCode >= 500) setOffline(true); }}
        userAgent="FlexaMarket/1.0 (Mobile App)"
      />
    </View>
  );
}

// ─── Fallback for Expo Go (no native webview) ─────────────────────────────────
function FallbackHome({ colors, insets, token }: any) {
  const [opened, setOpened] = useState(false);

  const openSite = useCallback(async () => {
    setOpened(true);
    await WebBrowser.openBrowserAsync(WEBSITE, {
      toolbarColor: "#F97316",
      controlsColor: "#FFFFFF",
      enableBarCollapsing: true,
      showTitle: true,
    });
  }, []);

  return (
    <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.logoBox, { backgroundColor: "#F97316" }]}>
        <Text style={styles.logoText}>FM</Text>
      </View>
      <Text style={[styles.brandTitle, { color: colors.foreground }]}>FlexaMarket</Text>
      <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>
        Caribbean & Latin America Marketplace
      </Text>

      <Pressable style={[styles.openBtn, { backgroundColor: "#F97316" }]} onPress={openSite}>
        <Feather name="globe" size={18} color="#fff" />
        <Text style={styles.openBtnText}>Ouvri FlexaMarket.com</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  progressTrack: { position: "absolute", left: 0, right: 0, height: 3, zIndex: 10 },
  progressFill: { height: 3 },
  logoBox: { width: 80, height: 80, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontSize: 32, fontFamily: "Inter_700Bold" },
  brandTitle: { fontSize: 26, fontFamily: "Inter_700Bold" },
  brandSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: -8 },
  openBtn: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 14, width: "100%" },
  openBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center" },
  offlineTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  offlineSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  retryText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
