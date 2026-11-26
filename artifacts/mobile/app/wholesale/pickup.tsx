import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesalePickupScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  const steps = [
    {
      title: "1. Agree in chat",
      body: "Confirm qty + pickup window with the seller before you travel to the depot.",
      href: "/wholesale/help",
    },
    {
      title: "2. Go to depot",
      body: "Bring ID · seller confirms stock at the warehouse address.",
      href: "/wholesale/warehouses",
    },
    {
      title: "3. Load & pay",
      body: "Payment arranged offline / wallet — no Buy Now cart on Flexa Wholesale.",
      href: "/wholesale/deals",
    },
  ];

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_pickupTitle")} subtitle={t("wholesale_pickupSubtitle")}>
        <View style={styles.steps}>
          {steps.map((s, i) => (
            <Pressable key={s.title} style={styles.card} onPress={() => router.push(s.href as any)}>
              <Text style={styles.stepLabel}>{t("wholesale_step").replace("{{n}}", String(i + 1))}</Text>
              <Text style={styles.stepTitle}>{s.title}</Text>
              <Text style={styles.stepBody}>{s.body}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.ctas}>
          <Pressable style={styles.primary} onPress={() => router.push("/wholesale/warehouses")}>
            <Text style={styles.primaryText}>Browse depots</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => router.push("/wholesale/help")}>
            <Text style={styles.secondaryText}>How wholesale works</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => router.push("/wholesale/deals")}>
            <Text style={styles.secondaryText}>Closed deals</Text>
          </Pressable>
        </View>
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
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
