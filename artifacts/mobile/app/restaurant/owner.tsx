import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useLanguage } from "@/context/LanguageContext";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

const LINKS = [
  { href: "/restaurant/add", title: "restaurant_addRestaurant", body: "restaurant_addRestaurantSubtitle" },
  { href: "/restaurant/discover", title: "restaurant_discoverTitle", body: "restaurant_ownerDashboardSubtitle" },
];

export default function RestaurantOwnerScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <RestaurantShell title={t("restaurant_ownerDashboard")} subtitle={t("restaurant_ownerDashboardSubtitle")}>
      <Text style={styles.note}>{t("restaurant_freeLaunchNote")}</Text>
      {LINKS.map((l) => (
        <Pressable key={l.href} style={styles.card} onPress={() => router.push(l.href as any)}>
          <Text style={styles.title}>{t(l.title)}</Text>
          <Text style={styles.sub}>{t(l.body)}</Text>
        </Pressable>
      ))}
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, color: T.muted, marginBottom: 12, lineHeight: 17 },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontWeight: "800", color: T.ink },
  sub: { marginTop: 4, fontSize: 13, color: T.muted },
});