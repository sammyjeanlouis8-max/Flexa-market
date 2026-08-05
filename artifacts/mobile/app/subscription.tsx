import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SafeWebView from "@/components/SafeWebView";

const SUBSCRIPTION_URL = "https://flexamarket.com/subscription";

function IOSSubscriptionInfo() {
  const insets = useSafeAreaInsets();
  const [opening, setOpening] = useState(false);

  async function openSubscriptionBrowser() {
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(SUBSCRIPTION_URL, {
        // SFSafariViewController — stays inside the app, no Dynamic Island back button
        dismissButtonStyle: "close",
        controlsColor: "#F97316",
        // Match the app's dark theme
        readerMode: false,
        enableBarCollapsing: true,
      });
    } catch {
      /* ignore */
    } finally {
      setOpening(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Text style={styles.icon}>👑</Text>
      <Text style={styles.title}>Flexa Market Premium</Text>
      <Text style={styles.subtitle}>
        Chwazi yon plan ki pi bon pou ou
      </Text>

      {/* Standard Plan */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Standard Plan — $15/mwa</Text>
        <View style={styles.featureList}>
          {[
            "Jiska 50 lis aktif",
            "Badge vendè verifye",
            "Statistik lavant",
            "Sipò prioritè",
          ].map((f) => (
            <View key={f} style={styles.featureRow}>
              <Text style={styles.check}>✓</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Premium Plan */}
      <View style={[styles.card, styles.cardPremium]}>
        <Text style={[styles.cardTitle, styles.cardTitlePremium]}>
          Premium Plan — $30/mwa
        </Text>
        <View style={styles.featureList}>
          {[
            "Lis ilimite",
            "Badge Premium doré",
            "Upload vidéo pou lis",
            "Analitik avanse",
            "Priyorite nan rechèch",
            "Sipò dedye 24/7",
          ].map((f) => (
            <View key={f} style={styles.featureRow}>
              <Text style={[styles.check, styles.checkPremium]}>✓</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* CTA — opens in-app SFSafariViewController, no Dynamic Island back button */}
      <Pressable
        style={[styles.subscribeBtn, opening && styles.subscribeBtnDisabled]}
        onPress={openSubscriptionBrowser}
        disabled={opening}
      >
        {opening ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.subscribeBtnText}>💳 Abòne kounye a</Text>
        )}
      </Pressable>

      <Text style={styles.note}>
        Peman sekirize pa Stripe · Kont ou ap mete ajou otomatikman
      </Text>
    </ScrollView>
  );
}

export default function SubscriptionScreen() {
  if (Platform.OS === "ios") {
    return <IOSSubscriptionInfo />;
  }
  return <SafeWebView uri={SUBSCRIPTION_URL} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  content: { paddingHorizontal: 20, alignItems: "center" },
  icon: { fontSize: 56, marginBottom: 12 },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    marginBottom: 28,
  },
  card: {
    width: "100%",
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardPremium: { borderColor: "#F97316", borderWidth: 2 },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 14,
  },
  cardTitlePremium: { color: "#F97316" },
  featureList: { gap: 10 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  check: { color: "#22C55E", fontSize: 14, fontWeight: "700", width: 16 },
  checkPremium: { color: "#F97316" },
  featureText: { color: "#CBD5E1", fontSize: 14, flex: 1 },

  // CTA button
  subscribeBtn: {
    width: "100%",
    backgroundColor: "#F97316",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    shadowColor: "#F97316",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
    minHeight: 56,
  },
  subscribeBtnDisabled: { opacity: 0.65 },
  subscribeBtnText: { color: "#fff", fontSize: 17, fontWeight: "800" },

  note: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
});
