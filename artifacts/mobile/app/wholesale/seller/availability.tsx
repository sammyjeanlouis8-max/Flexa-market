import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleSellerAvailabilityScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <WholesaleSimplePage
      title={t("wholesale_availabilityTitle")}
      subtitle={t("wholesale_availabilitySubtitle")}
      stats={[{ label: t("wholesale_alerts"), value: "3" }]}
      items={[
        {
          title: "Water pallets",
          meta: "Under 50 cases",
          href: "/wholesale/seller/inventory",
          badge: "Alert",
        },
        {
          title: "Oil cartons",
          meta: "Under 20",
          href: "/wholesale/seller/inventory",
          badge: "Alert",
        },
        {
          title: "Cement bags",
          meta: "Under 100",
          href: "/wholesale/seller/inventory",
          badge: "Alert",
        },
      ]}
      actions={
        <View style={styles.wrap}>
          <View style={styles.tip}>
            <Text style={styles.tipTitle}>Stock alert tips</Text>
            <Text style={styles.tipBody}>
              Keep depot SKUs accurate before weekend pickup windows. Low stock alerts help you pause chat quotes before buyers arrive.
            </Text>
          </View>
          <Pressable style={styles.cta} onPress={() => router.push("/wholesale/seller/inventory")}>
            <Text style={styles.ctaText}>Open inventory</Text>
          </Pressable>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  tip: {
    backgroundColor: T.mint,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  tipTitle: { fontSize: 13, fontWeight: "800", color: T.ink },
  tipBody: { marginTop: 6, fontSize: 13, color: T.muted, lineHeight: 18 },
  cta: {
    backgroundColor: T.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  ctaText: { color: T.white, fontWeight: "800", fontSize: 13 },
});
