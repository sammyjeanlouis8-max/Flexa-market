import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleSellerBoostScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <WholesaleSimplePage
      title={t("wholesale_boostTitle")}
      subtitle={t("wholesale_boostSubtitle")}
      items={[
        {
          title: "Boost Rice 50lb",
          meta: "7 days · Haiti feed",
          href: "/wholesale/featured",
          badge: "Boost",
        },
        {
          title: "Boost Cement",
          meta: "3 days · Construction",
          href: "/wholesale/featured",
          badge: "Boost",
        },
      ]}
      actions={
        <View style={styles.wrap}>
          <View style={styles.tip}>
            <Text style={styles.tipTitle}>How boost works</Text>
            <Text style={styles.tipBody}>
              Featured slots surface depot stock at the top of the wholesale catalog for your country. Buyers still close deals in chat — no cart checkout.
            </Text>
          </View>
          <Pressable style={styles.cta} onPress={() => router.push("/wholesale/featured")}>
            <Text style={styles.ctaText}>View featured feed</Text>
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
