import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  confirmRestaurantOrderPin,
  fetchRestaurantOrders,
  formatMoney,
  patchOrderStatus,
  refundRestaurantOrder,
  statusLabel,
  type Order,
} from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

const NEXT: Record<string, string[]> = {
  pending_payment: ["canceled"],
  order_placed: ["confirmed", "rejected", "canceled"],
  pending: ["confirmed", "rejected", "canceled"],
  confirmed: ["preparing", "canceled"],
  preparing: ["ready_for_pickup", "out_for_delivery"],
  ready_for_pickup: ["completed"],
  out_for_delivery: ["delivered", "completed"],
  delivered: ["completed"],
  completed: [],
  rejected: [],
  canceled: [],
  refund_pending: [],
  refunded: [],
};

export default function OwnerOrdersScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const { rid } = useLocalSearchParams<{ rid?: string }>();
  const restaurantId = Number(rid) || 0;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinByOrder, setPinByOrder] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setError(null);
    try {
      setOrders(await fetchRestaurantOrders({ restaurantId }, { token }));
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

  async function setStatus(id: number, status: string) {
    try {
      const updated = await patchOrderStatus(id, status, { token: token! });
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (e: any) {
      setError(e?.message || "Update failed");
    }
  }

  async function confirmPin(id: number) {
    const pin = pinByOrder[id] || "";
    try {
      const updated = await confirmRestaurantOrderPin(id, pin, { token: token! });
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (e: any) {
      setError(e?.message || "Invalid PIN");
    }
  }

  async function refund(id: number) {
    try {
      const updated = await refundRestaurantOrder(id, { token: token! }, "Owner refund");
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (e: any) {
      setError(e?.message || "Refund failed");
    }
  }

  return (
    <RestaurantShell title={t("restaurant_orders") || "Orders"} subtitle={t("restaurant_myOrdersSubtitle")} scroll={false}>
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
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.err}>{error}</Text>
        ) : orders.length === 0 ? (
          <Text style={styles.muted}>{t("restaurant_noOrders")}</Text>
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
              <View style={styles.row}>
                {(NEXT[o.status] || []).map((s) => (
                  <Pressable key={s} style={styles.mini} onPress={() => void setStatus(o.id, s)}>
                    <Text style={styles.miniText}>{statusLabel(s)}</Text>
                  </Pressable>
                ))}
              </View>
              {["ready_for_pickup", "out_for_delivery", "delivered"].includes(o.status) ? (
                <View style={styles.pinRow}>
                  <TextInput
                    value={pinByOrder[o.id] || ""}
                    onChangeText={(v) => setPinByOrder((p) => ({ ...p, [o.id]: v }))}
                    placeholder="Confirm PIN"
                    placeholderTextColor={T.muted}
                    style={styles.input}
                    keyboardType="number-pad"
                  />
                  <Pressable style={styles.btn} onPress={() => void confirmPin(o.id)}>
                    <Text style={styles.btnText}>PIN</Text>
                  </Pressable>
                </View>
              ) : null}
              {["completed", "delivered", "order_placed", "confirmed"].includes(o.status) ? (
                <Pressable onPress={() => void refund(o.id)}>
                  <Text style={styles.refund}>{t("restaurant_refund") || "Refund"}</Text>
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
  pinRow: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" },
  input: {
    flex: 1,
    backgroundColor: T.mintSoft,
    borderRadius: 10,
    padding: 10,
    color: T.ink,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  btn: {
    backgroundColor: T.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  btnText: { color: T.white, fontWeight: "900" },
  refund: { marginTop: 10, color: "#b91c1c", fontWeight: "800", fontSize: 12 },
  err: { color: "#b91c1c" },
});
