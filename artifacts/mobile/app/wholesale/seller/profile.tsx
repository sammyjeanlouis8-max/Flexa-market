import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleSellerProfileScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <WholesaleSimplePage
      title={t("wholesale_profileTitle")}
      subtitle={t("wholesale_profileSubtitle")}
      items={[
        { title: "Company", meta: "Caribbean Bulk Co", href: "/wholesale/stores/1", badge: "Public" },
        { title: "Countries", meta: "Haiti", href: "/wholesale/country/Haiti", badge: "Public" },
        { title: "Depot city", meta: "Delmas", href: "/wholesale/seller/warehouse", badge: "Public" },
        { title: "Response time", meta: "Usually within 2 hours", badge: "Preview" },
      ]}
      actions={
        <View style={styles.wrap}>
          <Text style={styles.note}>
            Buyers see these fields before opening wholesale chat. Edit your public seller settings anytime.
          </Text>
          <Pressable style={styles.cta} onPress={() => router.push("/wholesale/seller/settings")}>
            <Text style={styles.ctaText}>Edit seller settings</Text>
          </Pressable>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  note: { fontSize: 13, color: T.muted, lineHeight: 18 },
  cta: {
    backgroundColor: T.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  ctaText: { color: T.white, fontWeight: "800", fontSize: 13 },
});
