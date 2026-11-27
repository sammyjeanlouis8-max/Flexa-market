import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchRestaurant, type Restaurant } from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

export default function RestaurantDetailScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const nid = Number(id);
    if (!Number.isFinite(nid)) return;
    fetchRestaurant(nid, { token })
      .then(setRow)
      .finally(() => setLoading(false));
  }, [id, token]);

  return (
    <RestaurantShell title={row?.name} subtitle={row?.city}>
      {loading ? (
        <ActivityIndicator color={T.accent} />
      ) : !row ? (
        <Text style={styles.err}>{t("restaurant_notFound")}</Text>
      ) : (
        <>
          <Text style={styles.note}>{t("restaurant_paymentNote")}</Text>
          <Text style={styles.body}>{row.description}</Text>
        </>
      )}
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, color: T.accent, marginBottom: 8, lineHeight: 17 },
  body: { fontSize: 14, color: T.ink, lineHeight: 20 },
  err: { color: "#b91c1c" },
});