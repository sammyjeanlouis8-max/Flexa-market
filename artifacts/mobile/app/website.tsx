import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, BackHandler, NativeModules, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const HAS_WEBVIEW = !!(NativeModules.RNCWebView);
let WebView: any = null;
if (HAS_WEBVIEW) {
  WebView = require("react-native-webview").default;
}

const WEBSITE = "https://flexamarket.com";

export default function WebsiteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ path?: string }>();
  const startPath = params.path && params.path !== "/" ? params.path : "/";
  const startUrl = `${WEBSITE}${startPath}`;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!HAS_WEBVIEW) {
    return <FallbackScreen startUrl={startUrl} topPad={topPad} colors={colors} insets={insets} />;
  }
  return <NativeWebViewScreen startUrl={startUrl} topPad={topPad} colors={colors} insets={insets} token={token} />;
}

// ─── Native WebView (Full Median.co-style) ────────────────────────────────────
function NativeWebViewScreen({ startUrl, topPad, colors, insets, token }: any) {
  const webRef = useRef<any>(null);
  const [navState, setNavState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showBars, setShowBars] = useState(true);
  const lastScrollY = useRef(0);
  const scrollTimeout = useRef<any>(null);

  const canGoBack = navState?.canGoBack ?? false;
  const canGoForward = navState?.canGoForward ?? false;
  const currentUrl = navState?.url ?? startUrl;
  const displayHost = currentUrl.replace(/^https?:\/\//, "").split("/")[0];
  const isHome = currentUrl === WEBSITE || currentUrl === WEBSITE + "/";

  // Inject auth token + hide native browser chrome elements
  const injectedJS = `
    (function() {
      try {
        ${token ? `localStorage.setItem('fm_token', ${JSON.stringify(token)});
        localStorage.setItem('auth_token', ${JSON.stringify(token)});` : ""}
        // Signal to the site that we're in the native app
        localStorage.setItem('is_native_app', 'true');
        window.isNativeApp = true;
        // Hide any "Download App" banners
        document.querySelectorAll('[data-app-banner],[class*="app-banner"],[id*="app-banner"]').forEach(el => el.style.display='none');
      } catch(e) {}
    })();
    true;
  `;

  // Android hardware back button
  React.useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) { webRef.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    webRef.current?.reload();
    setTimeout(() => setRefreshing(false), 1500);
  }, []);

  const handleError = useCallback(() => {
    setOffline(true);
    setLoading(false);
  }, []);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "navigate") router.push(msg.path);
      if (msg.type === "logout") router.replace("/auth/login");
    } catch {}
  }, []);

  if (offline) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={8}>
            <Feather name="x" size={22} color={colors.foreground} />
          </Pressable>
          <View style={styles.urlBar}>
            <Feather name="wifi-off" size={12} color="#EF4444" />
            <Text style={[styles.urlText, { color: colors.foreground }]}>Pas de connexion</Text>
          </View>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.offlineBox}>
          <Text style={{ fontSize: 60 }}>📡</Text>
          <Text style={[styles.offlineTitle, { color: colors.foreground }]}>Pa gen entènèt</Text>
          <Text style={[styles.offlineMsg, { color: colors.mutedForeground }]}>
            Verifye koneksyon ou epi eseye ankò.
          </Text>
          <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            onPress={() => { setOffline(false); setLoading(true); webRef.current?.reload(); }}>
            <Feather name="refresh-cw" size={16} color="#fff" />
            <Text style={styles.retryText}>Eseye Ankò</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top bar */}
      {showBars && (
        <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={8}>
            <Feather name="x" size={22} color={colors.foreground} />
          </Pressable>
          <View style={styles.urlBar}>
            <Feather name="lock" size={12} color="#22C55E" />
            <Text style={[styles.urlText, { color: colors.foreground }]} numberOfLines={1}>
              {displayHost}
            </Text>
          </View>
          <Pressable onPress={() => webRef.current?.reload()} style={styles.headerBtn} hitSlop={8}>
            {loading
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />}
          </Pressable>
        </View>
      )}

      {/* Progress bar */}
      {loading && (
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, {
            backgroundColor: colors.primary,
            width: `${Math.round(loadProgress * 100)}%` as any,
          }]} />
        </View>
      )}

      <WebView
        ref={webRef}
        source={{ uri: startUrl }}
        style={{ flex: 1, backgroundColor: colors.background }}
        injectedJavaScript={injectedJS}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        pullToRefreshEnabled={false}
        overScrollMode="never"
        onNavigationStateChange={setNavState}
        onLoadStart={() => { setLoading(true); setOffline(false); }}
        onLoadEnd={() => setLoading(false)}
        onLoadProgress={({ nativeEvent }: any) => setLoadProgress(nativeEvent.progress)}
        onError={handleError}
        onHttpError={({ nativeEvent }: any) => { if (nativeEvent.statusCode >= 500) handleError(); }}
        onMessage={handleMessage}
        userAgent="FlexaMarket/1.0 (Mobile App)"
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      />

      {/* Bottom navigation bar */}
      {showBars && (
        <View style={[styles.bottomBar, {
          paddingBottom: insets.bottom + 4,
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        }]}>
          <Pressable style={[styles.navBtn, !canGoBack && styles.disabled]}
            onPress={() => webRef.current?.goBack()} disabled={!canGoBack} hitSlop={10}>
            <Feather name="arrow-left" size={22} color={canGoBack ? colors.foreground : colors.border} />
          </Pressable>
          <Pressable style={[styles.navBtn, !canGoForward && styles.disabled]}
            onPress={() => webRef.current?.goForward()} disabled={!canGoForward} hitSlop={10}>
            <Feather name="arrow-right" size={22} color={canGoForward ? colors.foreground : colors.border} />
          </Pressable>
          <Pressable style={styles.navBtn}
            onPress={() => webRef.current?.injectJavaScript(`window.location.href='${WEBSITE}/';true;`)}
            hitSlop={10}>
            <Feather name="home" size={22} color={isHome ? colors.primary : colors.foreground} />
          </Pressable>
          <Pressable style={styles.navBtn} onPress={handleRefresh} hitSlop={10}>
            <Feather name="refresh-cw" size={22} color={colors.foreground} />
          </Pressable>
          <Pressable style={styles.navBtn}
            onPress={() => setShowBars(false)} hitSlop={10}>
            <Feather name="maximize-2" size={20} color={colors.foreground} />
          </Pressable>
        </View>
      )}

      {/* Full screen mode — tap to show bars again */}
      {!showBars && (
        <Pressable
          style={[styles.fullscreenReveal, { bottom: insets.bottom + 12 }]}
          onPress={() => setShowBars(true)}>
          <View style={[styles.fullscreenPill, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
            <Feather name="minimize-2" size={14} color="#fff" />
            <Text style={styles.fullscreenPillText}>Montre barre</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

// ─── Fallback (no native build) ───────────────────────────────────────────────
function FallbackScreen({ startUrl, topPad, colors, insets }: any) {
  const handleOpen = () =>
    WebBrowser.openBrowserAsync(startUrl, {
      toolbarColor: "#F97316",
      controlsColor: "#FFFFFF",
      enableBarCollapsing: true,
    });

  React.useEffect(() => { handleOpen(); }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={8}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.urlBar}>
          <Feather name="lock" size={12} color="#22C55E" />
          <Text style={[styles.urlText, { color: colors.foreground }]}>flexamarket.com</Text>
        </View>
        <View style={styles.headerBtn} />
      </View>
      <View style={[styles.offlineBox, { paddingBottom: insets.bottom + 40 }]}>
        <Text style={{ fontSize: 48 }}>🌐</Text>
        <Text style={[styles.offlineTitle, { color: colors.foreground }]}>Sit wèb la ap ouvri…</Text>
        <Text style={[styles.offlineMsg, { color: colors.mutedForeground }]}>
          Nouvo build ap pote WebView reyèl dirèkteman andan app la.
        </Text>
        <Pressable style={[styles.retryBtn, { backgroundColor: "#F97316" }]} onPress={handleOpen}>
          <Feather name="external-link" size={16} color="#FFF" />
          <Text style={styles.retryText}>Ouvri Kounye a</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1,
  },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  urlBar: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.06)", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  urlText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  progressTrack: { height: 3, width: "100%" },
  progressFill: { height: 3 },
  bottomBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    paddingTop: 10, borderTopWidth: 1,
  },
  navBtn: { width: 48, height: 44, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.3 },
  loadingOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },
  offlineBox: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: 14, paddingHorizontal: 32,
  },
  offlineTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  offlineMsg: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8,
  },
  retryText: { color: "#FFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  fullscreenReveal: { position: "absolute", alignSelf: "center" },
  fullscreenPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  fullscreenPillText: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
});
