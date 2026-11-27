import React from "react";
import { StyleSheet, Text } from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useLanguage } from "@/context/LanguageContext";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

export default function RestaurantAddScreen() {
  const { t } = useLanguage();
  return (
    <RestaurantShell title={t("restaurant_addRestaurantTitle")} subtitle={t("restaurant_addRestaurantSubtitle")}>
      <Text style={styles.p}>{t("restaurant_stepBasicsBody")}</Text>
      <Text style={styles.p}>{t("restaurant_identityPrivacyBody")}</Text>
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  p: { fontSize: 14, color: T.ink, lineHeight: 20, marginBottom: 12 },
});