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
  const bottomPad = insets.bottom + 60; // leave room for tab bar

  const injectedJS = `
    (function() {
      try {
        ${token ? `localStorage.setItem('fm_token', ${JSON.stringify(token)});
        localStorage.setItem('auth_token', ${JSON.stringify(token)});` : ""}
        localStorage.setItem('is_native_app', 'true');
        window.isNativeApp = true;

        // Hide website bottom nav bar (we use native tab bar instead)
        var style = document.createElement('style');
        style.innerHTML = [
          'nav[class*="bottom"], nav[class*="mobile-nav"], nav[class*="tab"], ',
          'div[class*="bottom-nav"], div[class*="mobile-nav"], div[class*="tab-bar"], ',
          'div[class*="bottomNav"], div[class*="mobileNav"], div[class*="tabBar"], ',
          'footer nav, [data-testid*="bottom-tab"], [data-testid*="nav-bar"], ',
          '[class*="app-banner"], [data-app-banner] { display: none !important; }',
          'body { padding-bottom: 0 !important; margin-bottom: 0 !important; }'
        ].join('');
        document.head.appendChild(style);

        // Re-apply after dynamic renders
        var obs = new MutationObserver(function() {
          document.querySelectorAll('[data-app-banner],[class*="app-banner"]').forEach(function(el){ el.style.display='none'; });
        });
        obs.observe(document.body, { childList: true, subtree: true });
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
        contentInset={{ bottom: bottomPad }}
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
      {/* Logo / Brand */}
      <View style={[styles.logoBox, { backgroundColor: "#F97316" }]}>
        <Text style={styles.logoText}>FM</Text>
      </View>
      <Text style={[styles.brandTitle, { color: colors.foreground }]}>FlexaMarket</Text>
      <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>
        Caribbean & Latin America Marketplace
      </Text>

      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="info" size={16} color={colors.primary} />
        <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
          WebView natif bezwen yon nouvo build. Pou kounye a, sit la ap ouvri nan browser app la.
        </Text>
      </View>

      <Pressable style={[styles.openBtn, { backgroundColor: "#F97316" }]} onPress={openSite}>
        <Feather name="globe" size={18} color="#fff" />
        <Text style={styles.openBtnText}>Ouvri FlexaMarket.com</Text>
      </Pressable>

      <Pressable style={[styles.openBtnOutline, { borderColor: colors.border }]} onPress={openSite}>
        <Feather name="refresh-cw" size={16} color={colors.foreground} />
        <Text style={[styles.openBtnOutlineText, { color: colors.foreground }]}>Rechaje</Text>
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
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 8 },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  openBtn: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 14, width: "100%" },
  openBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center" },
  openBtnOutline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1, width: "100%" },
  openBtnOutlineText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  offlineTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  offlineSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  retryText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
