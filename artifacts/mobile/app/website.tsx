/**
 * Intentional non-embedded website route.
 * Opens flexamarket.com in the platform browser (Chrome Custom Tabs / SFSafariView).
 * Never restores a marketplace WebView shell.
 */
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SITE_URL = "https://flexamarket.com";

export default function WebsiteExternalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const openSite = useCallback(async () => {
    setBusy(true);
    try {
      await WebBrowser.openBrowserAsync(SITE_URL, {
        enableBarCollapsing: true,
        showTitle: true,
      });
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
          testID="btn-website-back"
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Website</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.card}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>EXTERNAL BROWSER</Text>
        </View>
        <Text style={styles.heading}>Marketplace stays native</Text>
        <Text style={styles.body}>
          This app no longer embeds the website. Browse listings, cart, chat,
          and seller tools inside native screens. Use the platform browser only
          when you need the public website.
        </Text>
        <Pressable
          style={[styles.btn, busy && { opacity: 0.7 }]}
          onPress={() => void openSite()}
          disabled={busy}
          testID="btn-open-website-browser"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Open flexamarket.com</Text>
          )}
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.replace("/")}>
          <Text style={styles.secondaryText}>Back to Home</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 20,
    gap: 12,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { color: "#0369A1", fontWeight: "800", fontSize: 11 },
  heading: { fontSize: 18, fontWeight: "900", color: "#0F172A" },
  body: { fontSize: 14, lineHeight: 20, color: "#475569" },
  btn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondary: {
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  secondaryText: { color: "#0F172A", fontWeight: "800" },
});
