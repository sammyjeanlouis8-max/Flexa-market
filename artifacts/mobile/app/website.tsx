import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator, NativeModules, Platform, Pressable,
  StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

// react-native-webview requires a native build — check if the native module is compiled in
const HAS_WEBVIEW = !!(NativeModules.RNCWebView);
// Conditionally import so old builds don't crash
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

  // ── Fallback for old builds without react-native-webview compiled in ──────
  if (!HAS_WEBVIEW) {
    return <FallbackScreen startUrl={startUrl} topPad={topPad} colors={colors} insets={insets} />;
  }

  return <WebViewScreen startUrl={startUrl} topPad={topPad} colors={colors} insets={insets} token={token} />;
}

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
          <Text style={[styles.urlText, { color: colors.foreground }]} numberOfLines={1}>flexamarket.com</Text>
        </View>
        <View style={styles.headerBtn} />
      </View>
      <View style={[styles.upgradeBox, { paddingBottom: insets.bottom + 40 }]}>
        <Text style={{ fontSize: 48 }}>🌐</Text>
        <Text style={[styles.upgradeTitle, { color: colors.foreground }]}>Sit wèb la ap ouvri…</Text>
        <Text style={[styles.upgradeMsg, { color: colors.mutedForeground }]}>
          Nouvo build ap pote WebView reyèl dirèkteman andan app la.
        </Text>
        <Pressable style={[styles.openBtn, { backgroundColor: colors.accent }]} onPress={handleOpen}>
          <Feather name="external-link" size={16} color="#FFF" />
          <Text style={styles.openBtnText}>Ouvri Kounye a</Text>
        </Pressable>
      </View>
    </View>
  );
}

function WebViewScreen({ startUrl, topPad, colors, insets, token }: any) {
  const webRef = useRef<any>(null);
  const [navState, setNavState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  const injectedJS = token
    ? `(function(){try{localStorage.setItem('fm_token',${JSON.stringify(token)});localStorage.setItem('auth_token',${JSON.stringify(token)})}catch(e){}})();true;`
    : undefined;

  const canGoBack = navState?.canGoBack ?? false;
  const canGoForward = navState?.canGoForward ?? false;
  const currentUrl = navState?.url ?? startUrl;
  const displayHost = currentUrl.replace(/^https?:\/\//, "").split("/")[0];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={8}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.urlBar}>
          <Feather name="lock" size={12} color="#22C55E" />
          <Text style={[styles.urlText, { color: colors.foreground }]} numberOfLines={1}>{displayHost}</Text>
        </View>
        <Pressable onPress={() => webRef.current?.reload()} style={styles.headerBtn} hitSlop={8}>
          <Feather name={loading ? "x" : "refresh-cw"} size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {loading && (
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${Math.round(loadProgress * 100)}%` as any }]} />
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
        allowsBackForwardNavigationGestures
        onNavigationStateChange={setNavState}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onLoadProgress={({ nativeEvent }: any) => setLoadProgress(nativeEvent.progress)}
      />

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 4, backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <Pressable style={[styles.navBtn, !canGoBack && styles.disabled]} onPress={() => webRef.current?.goBack()} disabled={!canGoBack} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={canGoBack ? colors.foreground : colors.border} />
        </Pressable>
        <Pressable style={[styles.navBtn, !canGoForward && styles.disabled]} onPress={() => webRef.current?.goForward()} disabled={!canGoForward} hitSlop={10}>
          <Feather name="arrow-right" size={22} color={canGoForward ? colors.foreground : colors.border} />
        </Pressable>
        <Pressable style={styles.navBtn} onPress={() => webRef.current?.injectJavaScript(`window.location.href='${WEBSITE}/';`)} hitSlop={10}>
          <Feather name="home" size={22} color={colors.foreground} />
        </Pressable>
        <Pressable style={styles.navBtn} onPress={() => webRef.current?.reload()} hitSlop={10}>
          <Feather name="refresh-cw" size={22} color={colors.foreground} />
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
  progressTrack: { height: 2, width: "100%" },
  progressFill: { height: 2 },
  bottomBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    paddingTop: 10, borderTopWidth: 1,
  },
  navBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.3 },
  upgradeBox: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: 14, paddingHorizontal: 32,
  },
  upgradeTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  upgradeMsg: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  openBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8,
  },
  openBtnText: { color: "#FFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
