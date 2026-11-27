import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  fetchRestaurantOrders,
  formatMoney,
  patchOrderStatus,
  statusLabel,
  type Order,
} from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

export default function RestaurantMyOrdersScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders(await fetchRestaurantOrders({ mine: true }, { token }));
    } catch (e: any) {
      setError(e?.message || t("restaurant_loadError"));
      setOrders([]);
    }
  }, [token, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load]),
  );

  async function cancel(orderId: number) {
    try {
      const updated = await patchOrderStatus(orderId, "canceled", { token: token! });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
    } catch (e: any) {
      setError(e?.message || "Cancel failed");
    }
  }

  return (
    <RestaurantShell title={t("restaurant_myOrdersTitle")} subtitle={t("restaurant_myOrdersSubtitle")} scroll={false}>
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
        <Text style={styles.note}>{t("restaurant_deliveryManagedByBusiness")}</Text>
        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.err}>{error}</Text>
        ) : orders.length === 0 ? (
          <>
            <Text style={styles.text}>{t("restaurant_noOrders")}</Text>
            <Pressable style={styles.btn} onPress={() => router.push("/restaurant/discover" as any)}>
              <Text style={styles.btnText}>{t("restaurant_discoverTitle")}</Text>
            </Pressable>
          </>
        ) : (
          orders.map((o) => (
            <View key={o.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.title}>#{o.id}</Text>
                <Text style={styles.badge}>{statusLabel(o.status)}</Text>
              </View>
              <Text style={styles.muted}>
                {formatMoney(o.total, o.currency)} · {o.fulfillment}
                {o.paymentStatus ? ` · ${o.paymentStatus}` : ""}
              </Text>
              <Text style={styles.muted}>{new Date(o.createdAt).toLocaleString()}</Text>
              {["order_placed", "pending_payment", "confirmed", "pending"].includes(o.status) ? (
                <Pressable style={styles.cancel} onPress={() => void cancel(o.id)}>
                  <Text style={styles.cancelText}>{t("restaurant_orderCancelled") || "Cancel"}</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, color: T.accent, marginBottom: 10, lineHeight: 17 },
  text: { fontWeight: "700", color: T.ink },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
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
  cancel: { marginTop: 10, alignSelf: "flex-start" },
  cancelText: { color: "#b91c1c", fontWeight: "800", fontSize: 12 },
});
