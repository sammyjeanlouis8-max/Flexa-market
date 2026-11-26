import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleSellerMediaScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <WholesaleSimplePage
      title={t("wholesale_mediaTitle")}
      subtitle={t("wholesale_mediaSubtitle")}
      stats={[{ label: t("wholesale_images"), value: "18" }]}
      items={[
        { title: "rice-main.jpg", meta: "Used on 2 listings", href: "/wholesale/seller", badge: "Image" },
        { title: "depot-door.jpg", meta: "Warehouse proof", href: "/wholesale/seller/warehouse", badge: "Image" },
      ]}
      actions={
        <View style={styles.wrap}>
          <View style={styles.tip}>
            <Text style={styles.tipTitle}>Listing photo tips</Text>
            <Text style={styles.tipBody}>
              Use clear depot stock photos — bag counts, pallet stacks, and warehouse doors help buyers trust chat deals.
            </Text>
          </View>
          <Pressable style={styles.cta} onPress={() => router.push("/wholesale/seller/new")}>
            <Text style={styles.ctaText}>Add listing with photos</Text>
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
