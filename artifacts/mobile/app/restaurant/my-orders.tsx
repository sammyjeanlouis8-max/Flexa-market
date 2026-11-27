import React from "react";
import { StyleSheet, Text } from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useLanguage } from "@/context/LanguageContext";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

export default function RestaurantMyOrdersScreen() {
  const { t } = useLanguage();
  return (
    <RestaurantShell title={t("restaurant_myOrdersTitle")} subtitle={t("restaurant_myOrdersSubtitle")}>
      <Text style={styles.text}>{t("restaurant_noOrders")}</Text>
      <Text style={styles.muted}>{t("restaurant_paymentNote")}</Text>
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  text: { fontWeight: "700", color: T.ink },
  muted: { marginTop: 8, fontSize: 13, color: T.muted, lineHeight: 18 },
});