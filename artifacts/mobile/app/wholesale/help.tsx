import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleHelpScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  const steps = [
    {
      title: t("wholesale_helpStepBrowse"),
      body: t("wholesale_helpStepBrowseBody"),
    },
    {
      title: t("wholesale_helpStepChat"),
      body: t("wholesale_helpStepChatBody"),
    },
    {
      title: t("wholesale_helpStepPickup"),
      body: t("wholesale_helpStepPickupBody"),
    },
  ];

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_helpTitle")} subtitle={t("wholesale_helpSubtitle")}>
        <View style={styles.steps}>
          {steps.map((s, i) => (
            <View key={s.title} style={styles.card}>
              <Text style={styles.stepLabel}>
                {t("wholesale_step").replace("{{n}}", String(i + 1))}
              </Text>
              <Text style={styles.stepTitle}>{s.title}</Text>
              <Text style={styles.stepBody}>{s.body}</Text>
            </View>
          ))}
        </View>
        <View style={styles.ctas}>
          <Pressable style={styles.primary} onPress={() => router.push("/wholesale")}>
            <Text style={styles.primaryText}>{t("wholesale_helpBrowseCatalog")}</Text>
          </Pressable>
          <Pressable
            style={styles.secondary}
            onPress={() => router.push("/wholesale/seller/onboarding")}
          >
            <Text style={styles.secondaryText}>{t("wholesale_helpSellDepot")}</Text>
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
