import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleDisputesScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  const steps = [
    {
      title: "Gather the chat deal",
      body: "Screenshot the agreed qty, price, and pickup window from wholesale chat.",
    },
    {
      title: "Contact Flexa support",
      body: "Open Help and describe the depot issue — delay, wrong qty, or no-show.",
    },
    {
      title: "Keep pickup proof",
      body: "Photos of stock at the warehouse help resolve disputes faster.",
    },
  ];

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_disputesTitle")} subtitle={t("wholesale_disputesSubtitle")}>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t("wholesale_openLabel")}</Text>
            <Text style={styles.statValue}>1</Text>
          </View>
        </View>

        <View style={styles.list}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Pickup delay · Rice</Text>
              <Text style={styles.rowMeta}>Waiting seller reply</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Open</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Wrong qty note</Text>
              <Text style={styles.rowMeta}>Closed</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Closed</Text>
            </View>
          </View>
        </View>

        <Text style={styles.section}>Support steps</Text>
        <View style={styles.steps}>
          {steps.map((s, i) => (
            <View key={s.title} style={styles.card}>
              <Text style={styles.stepLabel}>{t("wholesale_step").replace("{{n}}", String(i + 1))}</Text>
              <Text style={styles.stepTitle}>{s.title}</Text>
              <Text style={styles.stepBody}>{s.body}</Text>
            </View>
          ))}
        </View>

        <View style={styles.ctas}>
          <Pressable style={styles.primary} onPress={() => router.push("/wholesale/help")}>
            <Text style={styles.primaryText}>Open wholesale help</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => router.push("/wholesale/inquiries")}>
            <Text style={styles.secondaryText}>Back to chats</Text>
          </Pressable>
        </View>
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  stat: {
    flexGrow: 1,
    minWidth: "45%",
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: T.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statValue: { marginTop: 4, fontSize: 24, fontWeight: "800", color: T.accent },
  list: { gap: 8, marginBottom: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: T.ink },
  rowMeta: { marginTop: 2, fontSize: 12, color: T.muted },
  badge: {
    backgroundColor: T.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: T.accent, textTransform: "uppercase" },
  section: {
    marginBottom: 10,
    fontSize: 13,
    fontWeight: "800",
    color: T.forest,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  steps: { gap: 12 },
  card: {
    backgroundColor: T.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: T.accent,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  stepTitle: { marginTop: 6, fontSize: 15, fontWeight: "800", color: T.ink },
  stepBody: { marginTop: 6, fontSize: 13, color: T.muted, lineHeight: 18 },
  ctas: { marginTop: 20, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  primary: {
    backgroundColor: T.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryText: { color: T.white, fontWeight: "800", fontSize: 13 },
  secondary: {
    backgroundColor: T.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  secondaryText: { color: T.ink, fontWeight: "800", fontSize: 13 },
});
