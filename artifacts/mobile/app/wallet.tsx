import SafeWebView from "@/components/SafeWebView";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * iOS FM Wallet screen.
 *
 * FM Wallet is a person-to-person balance / marketplace wallet used to
 * receive seller earnings, refunds, and to transfer balance between users.
 * Person-to-person and marketplace flows are permitted by App Store
 * Guideline 3.1.5(a). However, to remain compliant with 3.1.1 (no steering
 * for digital purchases that would otherwise require IAP) this screen:
 *
 *   - shows NO prices or dollar amounts;
 *   - does NOT mention paying for in-app digital features (Boosts, Premium
 *     subscriptions) from the wallet — those references created a 3.1.1
 *     risk on iOS;
 *   - does NOT contain "go to flexamarket.com" or any other external
 *     purchase-mechanism CTA.
 *
 * Wallet management (recharge, cashout to bank/MonCash, P2P transfer) happens
 * outside the iOS app via the user's existing web account; the iOS app only
 * displays informational status. Android continues to load the full web UI.
 */
function IOSWalletInfo() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Text style={styles.icon}>💳</Text>
      <Text style={styles.title}>FM Wallet</Text>
      <Text style={styles.subtitle}>Balans ou disponib sou tout platfòm</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sa FM Wallet ye</Text>
        <View style={styles.featureList}>
          {[
            "Resevwa lajan vant ou fè",
            "Resevwa rembourseman pou komand anile",
            "Transfè balans bay lòt itilizatè",
            "Gade istwa tranzaksyon ou",
          ].map((f) => (
            <View key={f} style={styles.featureRow}>
              <Text style={styles.check}>✓</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Estati balans ou</Text>
        <Text style={styles.infoText}>
          Balans Wallet ou lye ak kont ou epi disponib sou tout aparèy. Tout
          tranzaksyon parèt otomatikman lè yo fini.
        </Text>
      </View>

      <Text style={styles.note}>
        Pou plis enfòmasyon sou kont ou, kontakte sipò atravè paramèt aplikasyon an.
      </Text>
    </ScrollView>
  );
}

export default function WalletScreen() {
  if (Platform.OS === "ios") {
    return <IOSWalletInfo />;
  }
  return <SafeWebView uri="https://flexamarket.com/wallet" />;
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
