import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleDealsScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <WholesaleSimplePage
      title={t("wholesale_dealsTitle")}
      subtitle={t("wholesale_dealsSubtitle")}
      stats={[
        { label: t("wholesale_thisMonth"), value: "12" },
        { label: t("wholesale_value"), value: "$8.4k" },
      ]}
      items={[
        {
          title: "Rice · Hotel Karibe",
          meta: "Closed chat · Delmas Depot · $1,040",
          href: "/wholesale/inquiries",
          badge: t("wholesale_paid"),
        },
        {
          title: "Cement · Construct SA",
          meta: "Closed chat · Yard 3 · $1,680",
          href: "/wholesale/inquiries",
          badge: t("wholesale_paid"),
        },
        {
          title: "Oil cartons · SuperMax",
          meta: "Closed chat · Cap Haitien · $762",
          href: "/wholesale/inquiries",
          badge: t("wholesale_paid"),
        },
      ]}
      actions={
        <Pressable style={styles.cta} onPress={() => router.push("/wholesale/inquiries")}>
          <Text style={styles.ctaText}>Open inquiries</Text>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  cta: {
    backgroundColor: T.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  ctaText: { color: T.white, fontWeight: "800", fontSize: 13 },
});
