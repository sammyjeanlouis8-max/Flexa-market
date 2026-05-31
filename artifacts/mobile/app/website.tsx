import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator, Platform, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const WEBSITE = "https://flexamarket.com";

export default function WebsiteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { path } = useLocalSearchParams<{ path?: string }>();
  const webRef = useRef<WebView>(null);

  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoFwd, setCanGoFwd] = useState(false);
  const [title, setTitle] = useState("FlexaMarket");
  const [error, setError] = useState(false);

  const startUrl = path ? `${WEBSITE}${path}` : WEBSITE;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // Inject auth token into localStorage so website auto-logs in
  const injectedJS = token
    ? `
      (function() {
        try {
          localStorage.setItem('flexamarket_token', ${JSON.stringify(token)});
          // Dispatch storage event so React picks it up
          window.dispatchEvent(new Event('storage'));
        } catch(e) {}
      })();
      true;
    `
    : `true;`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navBtn}>
          <Feather name="x" size={20} color={colors.foreground} />
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <Text style={[styles.titleText, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.urlText, { color: colors.mutedForeground }]} numberOfLines={1}>flexamarket.com</Text>
        </View>

        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => webRef.current?.reload()}
        >
          <Feather name="refresh-cw" size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Loading bar */}
      {loading && !error && (
        <View style={[styles.loadBar, { backgroundColor: colors.muted }]}>
          <View style={[styles.loadBarFill, { backgroundColor: colors.primary }]} />
        </View>
      )}

      {/* Error state */}
      {error ? (
        <View style={[styles.errorWrap, { backgroundColor: colors.background }]}>
          <Feather name="wifi-off" size={52} color={colors.mutedForeground} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>Koneksyon echwe</Text>
          <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>Verifye entènèt ou epi eseye ankò</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: colors.accent }]}
            onPress={() => { setError(false); webRef.current?.reload(); }}
          >
            <Text style={styles.retryText}>Eseye Ankò</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          ref={webRef}
          source={{ uri: startUrl }}
          style={styles.webview}
          injectedJavaScript={injectedJS}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsBackForwardNavigationGestures
          startInLoadingState={false}
          onLoadStart={() => { setLoading(true); setError(false); }}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
          onHttpError={() => { setLoading(false); }}
          onNavigationStateChange={(navState) => {
            setCanGoBack(navState.canGoBack);
            setCanGoFwd(navState.canGoForward);
            if (navState.title) setTitle(navState.title);
          }}
          onMessage={(e) => {
            // handle messages from web if needed
          }}
          renderLoading={() => (
            <View style={[StyleSheet.absoluteFill, styles.webLoading, { backgroundColor: colors.background }]}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          )}
        />
      )}

      {/* Bottom browser nav bar */}
      <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 4 }]}>
        <TouchableOpacity
          style={[styles.bottomBtn, !canGoBack && { opacity: 0.3 }]}
          onPress={() => canGoBack && webRef.current?.goBack()}
          disabled={!canGoBack}
        >
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bottomBtn, !canGoFwd && { opacity: 0.3 }]}
          onPress={() => canGoFwd && webRef.current?.goForward()}
          disabled={!canGoFwd}
        >
          <Feather name="chevron-right" size={22} color={colors.foreground} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.bottomBtn} onPress={() => webRef.current?.reload()}>
          <Feather name="refresh-cw" size={20} color={colors.foreground} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.bottomBtn} onPress={() => {
          webRef.current?.injectJavaScript(`window.location.href = '${WEBSITE}'; true;`);
        }}>
          <Feather name="home" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingBottom: 10,
    borderBottomWidth: 1, gap: 8,
  },
  navBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  titleWrap: { flex: 1, alignItems: "center" },
  titleText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  urlText: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  loadBar: { height: 3 },
  loadBarFill: { height: 3, width: "60%" },
  webview: { flex: 1 },
  webLoading: { alignItems: "center", justifyContent: "center" },
  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  errorSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  retryText: { color: "#FFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  bottomBar: {
    flexDirection: "row", justifyContent: "space-around",
    paddingTop: 8, borderTopWidth: 1,
  },
  bottomBtn: { width: 52, height: 40, alignItems: "center", justifyContent: "center" },
});
