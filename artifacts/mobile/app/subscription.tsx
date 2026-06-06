import SafeWebView from "@/components/SafeWebView";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function IOSSubscriptionInfo() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
    >
      <Text style={styles.icon}>👑</Text>
      <Text style={styles.title}>Flexa Market Premium</Text>
      <Text style={styles.subtitle}>Jere abonman ou sou flexamarket.com</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Standard Plan — $15/mwa</Text>
        <View style={styles.featureList}>
          {["Jiska 50 lis aktif", "Badge vendè verifye", "Statistik lavant", "Sipò prioritè"].map(f => (
            <View key={f} style={styles.featureRow}>
              <Text style={styles.check}>✓</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.card, styles.cardPremium]}>
        <Text style={[styles.cardTitle, styles.cardTitlePremium]}>Premium Plan — $30/mwa</Text>
        <View style={styles.featureList}>
          {["Lis ilimite", "Badge Premium doré", "Upload vidéo pou lis", "Analitik avanse", "Priyorite nan rechèch", "Sipò dedye 24/7"].map(f => (
            <View key={f} style={styles.featureRow}>
              <Text style={[styles.check, styles.checkPremium]}>✓</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💡 Kijan pou abòne</Text>
        <Text style={styles.infoText}>
          Abonman yo jere sou sit web nou an. Vizite{" "}
          <Text style={styles.infoLink}>flexamarket.com</Text>{" "}
          sou yon navigatè pou chwazi yon plan. Abonman ou ap parèt otomatikman nan app la aprè peman.
        </Text>
      </View>

      <Text style={styles.note}>
        Abonman ou lye ak kont ou epi disponib sou tout platfòm.
      </Text>
    </ScrollView>
  );
}

export default function SubscriptionScreen() {
  if (Platform.OS === "ios") {
    return <IOSSubscriptionInfo />;
  }
  return <SafeWebView uri="https://flexamarket.com/subscription" />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  content: { paddingHorizontal: 20, alignItems: "center" },
  icon: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "800", color: "#fff", textAlign: "center", marginBottom: 6 },
  subtitle: { fontSize: 14, color: "#94A3B8", textAlign: "center", marginBottom: 28 },
  card: {
    width: "100%", backgroundColor: "#1E293B", borderRadius: 16,
    padding: 20, marginBottom: 16, borderWidth: 1, borderColor: "#334155",
  },
  cardPremium: { borderColor: "#F97316", borderWidth: 2 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 14 },
  cardTitlePremium: { color: "#F97316" },
  featureList: { gap: 10 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  check: { color: "#22C55E", fontSize: 14, fontWeight: "700", width: 16 },
  checkPremium: { color: "#F97316" },
  featureText: { color: "#CBD5E1", fontSize: 14, flex: 1 },
  infoBox: {
    width: "100%", backgroundColor: "#1E3A5F", borderRadius: 14,
    padding: 18, marginBottom: 16, borderWidth: 1, borderColor: "#2563EB33",
  },
  infoTitle: { color: "#93C5FD", fontSize: 15, fontWeight: "700", marginBottom: 8 },
  infoText: { color: "#CBD5E1", fontSize: 14, lineHeight: 22 },
  infoLink: { color: "#F97316", fontWeight: "600" },
  note: { color: "#64748B", fontSize: 12, textAlign: "center", lineHeight: 18 },
});
