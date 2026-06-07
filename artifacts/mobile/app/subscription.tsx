import SafeWebView from "@/components/SafeWebView";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * iOS subscription screen.
 *
 * App Store Guideline 3.1.1 ("Steering" / external purchase mechanism) forbids
 * displaying prices for digital subscriptions delivered outside Apple's IAP
 * and forbids in-app links, buttons, or calls-to-action that direct users to
 * a purchasing mechanism other than IAP (including websites). This screen
 * therefore:
 *
 *   - shows feature information only, with NO prices and NO plan names that
 *     imply a paywall ("Standard $15/mo", "Premium $30/mo");
 *   - shows NO references to flexamarket.com, NO instructions to "subscribe
 *     on the web", and NO external-purchase CTAs;
 *   - explains that premium features activate automatically when the
 *     account has an active subscription (which can be obtained outside the
 *     iOS app — but we never tell the user how, per Apple's rules).
 *
 * The Android variant continues to load the full web subscription page,
 * which is allowed by Google Play policy.
 */
function IOSSubscriptionInfo() {
  const insets = useSafeAreaInsets();
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
      <Text style={styles.subtitle}>Karakteristik avanse pou vendè ki seryè</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Karakteristik Premium</Text>
        <View style={styles.featureList}>
          {[
            "Badge vendè verifye",
            "Statistik lavant detaye",
            "Upload vidéo pou lis ou",
            "Analitik avanse",
            "Priyorite nan rezilta rechèch",
            "Sipò kliyan dedye",
          ].map((f) => (
            <View key={f} style={styles.featureRow}>
              <Text style={styles.check}>✓</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Estati abonman ou</Text>
        <Text style={styles.infoText}>
          Si ou gen yon abonman aktif, karakteristik Premium yo aktive otomatikman
          sou tout aparèy ou yo. Estati abonman ou lye ak kont ou epi disponib sou
          tout platfòm.
        </Text>
      </View>

      <Text style={styles.note}>
        Pou plis enfòmasyon sou kont ou, kontakte sipò atravè paramèt aplikasyon an.
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
