/**
 * Flexa Restaurant orders inbox — buyer + owner (chat-first kitchen requests).
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { RestaurantGate } from "@/components/restaurant/RestaurantGate";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import {
  fetchMyRestaurantOrders,
  updateRestaurantOrderStatus,
} from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";
import type { RestaurantOrderRequest, RestaurantOrderStatus } from "@/lib/restaurantTypes";

const OWNER_NEXT: Record<string, RestaurantOrderStatus[]> = {
  pending: ["accepted", "declined"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "completed"],
  out_for_delivery: ["completed"],
};

function statusLabel(s: string): string {
  return s.replace(/_/g, " ");
}

export default function RestaurantOrdersScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<"buyer" | "owner">("buyer");
  const [orders, setOrders] = useState<RestaurantOrderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setOrders(await fetchMyRestaurantOrders(role, { token }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load orders");
    } finally {
      setLoading(false);
    }
  }, [token, role]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const setStatus = async (order: RestaurantOrderRequest, status: RestaurantOrderStatus) => {
    if (!token) return;
    setBusyId(order.id);
    try {
      const updated = await updateRestaurantOrderStatus(order.id, status, { token });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <RestaurantGate>
      <RestaurantShell title="Kitchen Orders" subtitle="Chat-first requests · status tracking">
        <View style={styles.roleRow}>
          <Pressable
            style={[styles.roleChip, role === "buyer" && styles.roleOn]}
            onPress={() => setRole("buyer")}
          >
            <Text style={[styles.roleText, role === "buyer" && styles.roleTextOn]}>My orders</Text>
          </Pressable>
          <Pressable
            style={[styles.roleChip, role === "owner" && styles.roleOn]}
            onPress={() => setRole("owner")}
          >
            <Text style={[styles.roleText, role === "owner" && styles.roleTextOn]}>
              Incoming (owner)
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : orders.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="shopping-bag" size={28} color={T.accentSoft} />
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptyBody}>
              {role === "buyer"
                ? "Open a restaurant and tap Order / Message kitchen."
                : "When buyers send requests, they appear here with push alerts."}
            </Text>
          </View>
        ) : (
          orders.map((order) => (
            <View key={order.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.name} numberOfLines={1}>
                  {order.restaurantName || `Restaurant #${order.restaurantId}`}
                </Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{statusLabel(order.status)}</Text>
                </View>
              </View>
              <Text style={styles.meta}>
                {order.fulfillment} · ${order.subtotalUsd.toFixed(2)}
                {order.deliveryFeeUsd != null ? ` + $${order.deliveryFeeUsd.toFixed(2)} delivery` : ""}
              </Text>
              {order.items.map((it, i) => (
                <Text key={`${order.id}-${i}`} style={styles.itemLine}>
                  {it.qty}× {it.name}
                </Text>
              ))}
              {order.note ? <Text style={styles.note}>Note: {order.note}</Text> : null}

              <View style={styles.actions}>
                {order.conversationId ? (
                  <Pressable
                    style={styles.chatBtn}
                    onPress={() => router.push(`/chat/${order.conversationId}` as never)}
                  >
                    <Feather name="message-circle" size={14} color={T.forest} />
                    <Text style={styles.chatText}>Open chat</Text>
                  </Pressable>
                ) : null}

                {role === "buyer" && order.status === "pending" ? (
                  <Pressable
                    style={styles.warnBtn}
                    disabled={busyId === order.id}
                    onPress={() => void setStatus(order, "cancelled")}
                  >
                    <Text style={styles.warnText}>Cancel</Text>
                  </Pressable>
                ) : null}

                {role === "owner"
                  ? (OWNER_NEXT[order.status] || []).map((next) => (
                      <Pressable
                        key={next}
                        style={[
                          styles.nextBtn,
                          (next === "declined" || next === "cancelled") && styles.warnBtn,
                        ]}
                        disabled={busyId === order.id}
                        onPress={() => void setStatus(order, next)}
                      >
                        <Text
                          style={[
                            styles.nextText,
                            (next === "declined" || next === "cancelled") && styles.warnText,
                          ]}
                        >
                          {statusLabel(next)}
                        </Text>
                      </Pressable>
                    ))
                  : null}
              </View>
            </View>
          ))
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </RestaurantShell>
    </RestaurantGate>
  );
}

const styles = StyleSheet.create({
  roleRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.line,
  },
  roleOn: { backgroundColor: T.mint, borderColor: T.accent },
  roleText: { fontSize: 12, fontWeight: "700", color: T.muted },
  roleTextOn: { color: T.forest },
  empty: { alignItems: "center", paddingVertical: 36, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: T.ink },
  emptyBody: { fontSize: 13, color: T.muted, textAlign: "center", lineHeight: 18 },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: "800", color: T.ink },
  statusPill: {
    backgroundColor: T.mint,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { fontSize: 11, fontWeight: "800", color: T.forest, textTransform: "capitalize" },
  meta: { marginTop: 4, fontSize: 12, fontWeight: "600", color: T.muted },
  itemLine: { marginTop: 4, fontSize: 13, fontWeight: "600", color: T.ink },
  note: { marginTop: 8, fontSize: 12, color: T.muted, fontStyle: "italic" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: T.mint,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  chatText: { fontSize: 12, fontWeight: "800", color: T.forest },
  nextBtn: {
    backgroundColor: T.forest,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  nextText: { fontSize: 12, fontWeight: "800", color: T.white, textTransform: "capitalize" },
  warnBtn: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  warnText: { fontSize: 12, fontWeight: "800", color: T.danger, textTransform: "capitalize" },
  error: { color: T.danger, fontWeight: "600", marginTop: 10 },
});
