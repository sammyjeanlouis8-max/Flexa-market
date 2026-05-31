import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator, Platform, Pressable,
  StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { WebViewNavigation } from "react-native-webview";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const WEBSITE = "https://flexamarket.com";

export default function WebsiteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ path?: string }>();

  const startPath = params.path && params.path !== "/" ? params.path : "/";
  const startUrl = `${WEBSITE}${startPath}`;

  const webRef = useRef<WebView>(null);
  const [navState, setNavState] = useState<WebViewNavigation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // Inject auth token so the user is auto-logged-in on the website
  const injectedJS = token
    ? `
      (function() {
        try {
          localStorage.setItem('fm_token', ${JSON.stringify(token)});
          localStorage.setItem('auth_token', ${JSON.stringify(token)});
        } catch(e) {}
      })();
      true;
    `
    : undefined;

  const canGoBack = navState?.canGoBack ?? false;
  const canGoForward = navState?.canGoForward ?? false;
  const currentUrl = navState?.url ?? startUrl;
  const displayHost = currentUrl.replace(/^https?:\/\//, "").split("/")[0];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={8}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>

        <View style={styles.urlBar}>
          <Feather name="lock" size={12} color="#22C55E" />
          <Text style={[styles.urlText, { color: colors.foreground }]} numberOfLines={1}>
            {displayHost}
          </Text>
        </View>

        <Pressable
          onPress={() => webRef.current?.reload()}
          style={styles.headerBtn}
          hitSlop={8}
        >
          <Feather name={loading ? "x" : "refresh-cw"} size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Progress bar */}
      {loading && (
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.primary, width: `${loadProgress * 100}%` as any },
            ]}
          />
        </View>
      )}

      {/* WebView */}
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
        onLoadProgress={({ nativeEvent }) => setLoadProgress(nativeEvent.progress)}
        renderLoading={() => (
          <View style={[styles.loadingOverlay, { backgroundColor: colors.background }]}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        )}
      />

      {/* Bottom nav bar */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: insets.bottom + 4, backgroundColor: colors.card, borderTopColor: colors.border },
        ]}
      >
        <Pressable
          style={[styles.navBtn, !canGoBack && styles.disabled]}
          onPress={() => webRef.current?.goBack()}
          disabled={!canGoBack}
          hitSlop={10}
        >
          <Feather name="arrow-left" size={22} color={canGoBack ? colors.foreground : colors.border} />
        </Pressable>

        <Pressable
          style={[styles.navBtn, !canGoForward && styles.disabled]}
          onPress={() => webRef.current?.goForward()}
          disabled={!canGoForward}
          hitSlop={10}
        >
          <Feather name="arrow-right" size={22} color={canGoForward ? colors.foreground : colors.border} />
        </Pressable>

        <Pressable
          style={styles.navBtn}
          onPress={() => webRef.current?.injectJavaScript(`window.location.href = '${WEBSITE}/';`)}
          hitSlop={10}
        >
          <Feather name="home" size={22} color={colors.foreground} />
        </Pressable>

        <Pressable
          style={styles.navBtn}
          onPress={() => webRef.current?.reload()}
          hitSlop={10}
        >
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
  loadingOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },
  bottomBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    paddingTop: 10, borderTopWidth: 1,
  },
  navBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.3 },
});
