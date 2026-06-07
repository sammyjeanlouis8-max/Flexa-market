import SafeWebView from "@/components/SafeWebView";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * iOS Boost screen.
 *
 * App Store Guideline 3.1.1 forbids in-app pricing for, or steering toward,
 * any external purchase mechanism for digital features. This screen
 * therefore shows feature information only — no prices, no "buy on the web"
 * instructions, no external links — and remains entirely informational on iOS.
 *
 * The Android variant continues to load the full web boost page, which is
 * permitted under Google Play policy.
 */
function IOSBoostInfo() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Text style={styles.icon}>🚀</Text>
      <Text style={styles.title}>Boost Lis Ou</Text>
      <Text style={styles.subtitle}>Mete lis ou an devan plis achetè</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sa Boost fè pou lis ou</Text>
        <View style={styles.featureList}>
          {[
            "Lis ou parèt an tèt rechèch",
            "Badge \"Boosted\" atire plis je",
            "Vizibilite avanse pou jouk 7 jou",
            "Analitik boost an tan reyèl",
            "Chwazi piblik ou: peyi, vil, kategori",
          ].map((f) => (
            <View key={f} style={styles.featureRow}>
              <Text style={styles.check}>✓</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Boost Vidéo</Text>
        <View style={styles.featureList}>
          {[
            "Videyo promosyon nan fil aktyalite",
            "Rive direkteman kay achetè potentyèl",
            "Plis angajman ke lis foto nòmal",
          ].map((f) => (
            <View key={f} style={styles.featureRow}>
              <Text style={styles.check}>✓</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Boost ou sou kont ou</Text>
        <Text style={styles.infoText}>
          Boosts aktif yo lye ak kont ou epi vizib sou tout aparèy. Lè yon boost
          aktive sou kont ou, lis la parèt otomatikman ak badge boost la.
        </Text>
      </View>

      <Text style={styles.note}>
        Pou plis enfòmasyon sou kont ou, kontakte sipò atravè paramèt aplikasyon an.
      </Text>
    </ScrollView>
  );
}

export default function BoostScreen() {
  if (Platform.OS === "ios") {
    return <IOSBoostInfo />;
  }
  return <SafeWebView uri="https://flexamarket.com/boost" />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  content: { paddingHorizontal: 20, alignItems: "center" },
  icon: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "800", color: "#fff", textAlign: "center", marginBottom: 6 },
  subtitle: { fontSize: 14, color: "#94A3B8", textAlign: "center", marginBottom: 28 },
  card: {
    width: "100%",
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#F97316", marginBottom: 14 },
  featureList: { gap: 10 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  check: { color: "#22C55E", fontSize: 14, fontWeight: "700", width: 16 },
  featureText: { color: "#CBD5E1", fontSize: 14, flex: 1 },
  infoBox: {
    width: "100%",
    backgroundColor: "#1E3A5F",
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2563EB33",
  },
  infoTitle: { color: "#93C5FD", fontSize: 15, fontWeight: "700", marginBottom: 8 },
  infoText: { color: "#CBD5E1", fontSize: 14, lineHeight: 22 },
  note: { color: "#64748B", fontSize: 12, textAlign: "center", lineHeight: 18 },
});
