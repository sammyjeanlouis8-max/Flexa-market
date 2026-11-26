import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleVerificationScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  const steps = [
    {
      title: "Business docs",
      body: "Upload registration papers for company verification.",
      href: "/wholesale/seller/documents",
      badge: "Needed",
    },
    {
      title: "Depot proof",
      body: "Add warehouse photos and address for admin review.",
      href: "/wholesale/seller/warehouse",
      badge: "Needed",
    },
    {
      title: "Admin review",
      body: "Super Admin verifies ownership before you can sell in-country.",
      href: "/wholesale/seller/dashboard",
      badge: "Pending",
    },
  ];

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_verificationTitle")} subtitle={t("wholesale_verificationSubtitle")}>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t("wholesale_status")}</Text>
            <Text style={styles.statValue}>Pending</Text>
          </View>
        </View>
        <View style={styles.steps}>
          {steps.map((s, i) => (
            <Pressable key={s.title} style={styles.card} onPress={() => router.push(s.href as any)}>
              <Text style={styles.stepLabel}>{t("wholesale_step").replace("{{n}}", String(i + 1))}</Text>
              <View style={styles.rowHead}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{s.badge}</Text>
                </View>
              </View>
              <Text style={styles.stepBody}>{s.body}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.cta} onPress={() => router.push("/wholesale/seller/warehouse")}>
          <Text style={styles.ctaText}>Add depot for verification</Text>
        </Pressable>
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
  statValue: { marginTop: 4, fontSize: 24, fontWeight: "800", color: T.warn },
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
  rowHead: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8 },
  stepTitle: { flex: 1, fontSize: 15, fontWeight: "800", color: T.ink },
  stepBody: { marginTop: 6, fontSize: 13, color: T.muted, lineHeight: 18 },
  badge: {
    backgroundColor: T.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: T.accent, textTransform: "uppercase" },
  cta: {
    marginTop: 16,
    backgroundColor: T.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  ctaText: { color: T.white, fontWeight: "800", fontSize: 13 },
});
