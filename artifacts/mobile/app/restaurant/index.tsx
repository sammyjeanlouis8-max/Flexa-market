import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchRestaurants, type Restaurant } from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

export default function RestaurantHubScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(
        await fetchRestaurants(
          { country: user?.country, status: "published", menuPreview: true },
          { token },
        ),
      );
    } catch (e: any) {
      setError(e?.message || t("restaurant_loadError"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, user?.country, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RestaurantShell title={t("restaurant_hubTitle")} subtitle={t("restaurant_hubSubtitle")}>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>{t("restaurant_freeLaunchNote")}</Text>
      </View>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>{t("restaurant_identityBadgeNote")}</Text>
      </View>
      <View style={styles.row}>
        <Pressable style={styles.chip} onPress={() => router.push("/restaurant/discover" as any)}>
          <Text style={styles.chipText}>{t("restaurant_discoverTitle")}</Text>
        </Pressable>
        <Pressable style={styles.chip} onPress={() => router.push("/restaurant/owner" as any)}>
          <Text style={styles.chipText}>{t("restaurant_tabOwner")}</Text>
        </Pressable>
        <Pressable style={styles.chip} onPress={() => router.push("/restaurant/add" as any)}>
          <Text style={styles.chipText}>{t("restaurant_addRestaurant")}</Text>
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={styles.err}>{error}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.muted}>{t("restaurant_emptyTitle")}</Text>
      ) : (
        rows.slice(0, 8).map((r) => (
          <Pressable key={r.id} style={styles.card} onPress={() => router.push(`/restaurant/${r.id}` as any)}>
            <Text style={styles.cardTitle}>{r.name}</Text>
            <Text style={styles.muted}>
              {r.avgRating && r.avgRating > 0 ? `★ ${r.avgRating.toFixed(1)} · ` : ""}
              {r.serviceArea || `${r.city}, ${r.country}`}
            </Text>
          </Pressable>
        ))
      )}
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: "rgba(26,107,71,0.1)",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  noticeText: { fontSize: 12, color: T.ink, lineHeight: 17 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 8 },
  chip: {
    backgroundColor: T.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipText: { color: T.white, fontWeight: "800", fontSize: 12 },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  cardTitle: { fontWeight: "800", color: T.ink, fontSize: 15 },
  muted: { color: T.muted, fontSize: 12, marginTop: 2 },
  err: { color: "#b91c1c", marginTop: 12 },
});
