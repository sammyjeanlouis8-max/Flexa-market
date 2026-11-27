import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchMyReservations, statusLabel } from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

export default function MyReservationsScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchMyReservations({ token }));
    } catch (e: any) {
      setError(e?.message || t("restaurant_loadError"));
    }
  }, [token, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load]),
  );

  return (
    <RestaurantShell
      title={t("restaurant_myReservations") || "My reservations"}
      subtitle={t("restaurant_myReservationsSubtitle") || ""}
      scroll={false}
    >
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
          <>
            <Text style={styles.muted}>{t("restaurant_noReservations") || "No reservations yet."}</Text>
            <Pressable style={styles.btn} onPress={() => router.push("/restaurant/discover" as any)}>
              <Text style={styles.btnText}>{t("restaurant_discoverTitle")}</Text>
            </Pressable>
          </>
        ) : (
          rows.map((r) => (
            <View key={String(r.id)} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.title}>#{r.id}</Text>
                <Text style={styles.badge}>{statusLabel(String(r.status || ""))}</Text>
              </View>
              <Text style={styles.muted}>
                {r.restaurantName || `Restaurant #${r.restaurantId}`}
                {r.partySize ? ` · ${r.partySize} guests` : ""}
              </Text>
              {r.reservedFor ? (
                <Text style={styles.muted}>{new Date(String(r.reservedFor)).toLocaleString()}</Text>
              ) : null}
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
  err: { color: "#b91c1c" },
  btn: {
    marginTop: 16,
    backgroundColor: T.accent,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnText: { color: T.white, fontWeight: "900" },
});
