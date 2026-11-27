import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getApiBase } from "@/lib/api";
import { fetchRestaurantReservations, statusLabel } from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

export default function OwnerReservationsScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const { rid } = useLocalSearchParams<{ rid?: string }>();
  const restaurantId = Number(rid) || 0;
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setError(null);
    try {
      setRows(await fetchRestaurantReservations(restaurantId, { token }));
    } catch (e: any) {
      setError(e?.message || t("restaurant_loadError"));
    }
  }, [restaurantId, token, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load]),
  );

  async function patch(id: number, status: string) {
    try {
      const res = await fetch(`${getApiBase()}/restaurants/me/reservations/${id}`, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed");
      await load();
    } catch (e: any) {
      setError(e?.message || "Update failed");
    }
  }

  return (
    <RestaurantShell title={t("restaurant_reservations") || "Reservations"} subtitle={t("restaurant_myReservationsSubtitle") || ""} scroll={false}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
            tintColor={T.accent}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.err}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.muted}>{t("restaurant_noReservations") || "No reservations yet."}</Text>
        ) : (
          rows.map((r) => (
            <View key={String(r.id)} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.title}>#{r.id}</Text>
                <Text style={styles.badge}>{statusLabel(String(r.status || ""))}</Text>
              </View>
              <Text style={styles.muted}>
                {r.partySize ? `${r.partySize} guests` : ""}
                {r.reservedFor ? ` · ${new Date(String(r.reservedFor)).toLocaleString()}` : ""}
              </Text>
              <View style={styles.row}>
                {["confirmed", "canceled", "completed"].map((s) => (
                  <Pressable key={s} style={styles.mini} onPress={() => void patch(Number(r.id), s)}>
                    <Text style={styles.miniText}>{statusLabel(s)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between" },
  title: { fontWeight: "900", color: T.ink },
  badge: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    color: T.accent,
    backgroundColor: "rgba(26,107,71,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  muted: { marginTop: 4, fontSize: 12, color: T.muted },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  mini: {
    backgroundColor: "rgba(26,107,71,0.08)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  miniText: { fontSize: 10, fontWeight: "800", color: T.accent },
  err: { color: "#b91c1c" },
});
