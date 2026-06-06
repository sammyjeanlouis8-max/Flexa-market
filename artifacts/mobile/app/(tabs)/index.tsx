import { Feather } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, BackHandler, Platform,
  Pressable, StyleSheet, Text, View,
} from "react-native";
import WebView from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePushNotifications } from "../../hooks/usePushNotifications";

const WEBSITE = "https://flexamarket.com";

const INTERNAL_HOSTS = [
  "flexamarket.com",
  "www.flexamarket.com",
  "bonjour-tool.replit.app",
];

function isInternal(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return INTERNAL_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h));
  } catch {
    return true;
  }
}

type PermStatus = "checking" | "granted" | "denied" | "undetermined";

export default function HomeTab() {
  const insets = useSafeAreaInsets();
  const webRef = useRef<any>(null);
  const [navState, setNavState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [offline, setOffline] = useState(false);
  const [permStatus, setPermStatus] = useState<PermStatus>("checking");

  const injectJs = useCallback((script: string) => {
    webRef.current?.injectJavaScript(script);
  }, []);

  usePushNotifications(injectJs);

  const canGoBack = navState?.canGoBack ?? false;

  useEffect(() => {
    checkAndRequestPermission();
  }, []);

  async function checkAndRequestPermission() {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") { setPermStatus("granted"); return; }
    if (status === "undetermined") {
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      setPermStatus(newStatus === "granted" ? "granted" : "denied");
    } else {
      setPermStatus("denied");
    }
  }

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) { webRef.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  if (permStatus === "checking") {
    return (
      <View style={[styles.center, { backgroundColor: "#0F172A", paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  if (permStatus === "denied") {
    return (
      <View style={[styles.center, { backgroundColor: "#0F172A", paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.logoBox, { backgroundColor: "#F97316" }]}>
          <Text style={styles.logoText}>FM</Text>
        </View>
        <Text style={styles.gateTitle}>Aktive Notifikasyon</Text>
        <Text style={styles.gateSub}>
          FlexaMarket itilize notifikasyon pou voye mesaj, lòd, ak alèt enpòtan ba ou.{"\n\n"}
          Notifikasyon yo obligatwa pou itilize app la.
        </Text>
        <View style={styles.iconRow}>
          <View style={styles.iconItem}>
            <Text style={styles.iconEmoji}>💬</Text>
            <Text style={styles.iconLabel}>Mesaj</Text>
          </View>
          <View style={styles.iconItem}>
            <Text style={styles.iconEmoji}>📦</Text>
            <Text style={styles.iconLabel}>Lòd</Text>
          </View>
          <View style={styles.iconItem}>
            <Text style={styles.iconEmoji}>💰</Text>
            <Text style={styles.iconLabel}>Peman</Text>
          </View>
        </View>
        <Pressable
          style={[styles.settingsBtn, { backgroundColor: "#F97316" }]}
          onPress={() => Linking.openSettings()}
        >
          <Feather name="settings" size={18} color="#fff" />
          <Text style={styles.settingsBtnText}>Ouvri Paramèt</Text>
        </Pressable>
        <Pressable
          style={styles.recheckBtn}
          onPress={async () => {
            setPermStatus("checking");
            const { status } = await Notifications.getPermissionsAsync();
            setPermStatus(status === "granted" ? "granted" : "denied");
          }}
        >
          <Text style={styles.recheckText}>M aktive li — kontinye</Text>
        </Pressable>
      </View>
    );
  }

  if (offline) {
    return (
      <View style={[styles.center, { backgroundColor: "#0F172A" }]}>
        <Text style={{ fontSize: 56 }}>📡</Text>
        <Text style={[styles.offlineTitle, { color: "#fff" }]}>Pa gen entènèt</Text>
        <Text style={[styles.offlineSub, { color: "#94a3b8" }]}>Verifye koneksyon ou epi eseye ankò.</Text>
        <Pressable
          style={[styles.retryBtn, { backgroundColor: "#F97316" }]}
          onPress={() => { setOffline(false); setLoading(true); webRef.current?.reload(); }}
        >
          <Feather name="refresh-cw" size={16} color="#fff" />
          <Text style={styles.retryText}>Eseye Ankò</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {loading && (
        <View style={[styles.progressTrack, { top: insets.top }]}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
        </View>
      )}
      <WebView
        ref={webRef}
        source={{ uri: WEBSITE }}
        style={{ flex: 1 }}
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
        onShouldStartLoadWithRequest={(request) => {
          const url = request.url;
          if (isInternal(url)) return true;
          Linking.openURL(url).catch(() => {});
          return false;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  progressTrack: { position: "absolute", left: 0, right: 0, height: 3, zIndex: 10, backgroundColor: "#1e293b" },
  progressFill: { height: 3, backgroundColor: "#F97316" },
  logoBox: { width: 80, height: 80, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontSize: 32, fontWeight: "700" },
  offlineTitle: { fontSize: 22, fontWeight: "700" },
  offlineSub: { fontSize: 14, textAlign: "center" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  retryText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  gateTitle: { fontSize: 26, fontWeight: "800", color: "#fff", textAlign: "center" },
  gateSub: { fontSize: 14, color: "#94a3b8", textAlign: "center", lineHeight: 22 },
  iconRow: { flexDirection: "row", gap: 24, marginVertical: 8 },
  iconItem: { alignItems: "center", gap: 4 },
  iconEmoji: { fontSize: 32 },
  iconLabel: { color: "#94a3b8", fontSize: 12, fontWeight: "600" },
  settingsBtn: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 14, width: "100%" },
  settingsBtnText: { color: "#fff", fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  recheckBtn: { paddingVertical: 12 },
  recheckText: { color: "#F97316", fontSize: 14, fontWeight: "600" },
});
