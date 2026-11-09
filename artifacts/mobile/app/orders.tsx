/**
 * Native Orders — GET /api/orders/purchases
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  fetchPurchases,
  type PurchaseOrder,
} from "@/lib/ordersApi";
import {
  ORDER_FILTERS,
  ORDER_FILTER_LABELS,
  formatDate,
  formatMoney,
  listStatusLabel,
  matchesOrderFilter,
  orderRef,
  type OrderFilterKey,
} from "@/lib/orderUi";

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<OrderFilterKey>("all");

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const rows = await fetchPurchases({ token });
        setOrders(rows);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load orders");
        setOrders((prev) => prev ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load("initial");
    }, [authLoading, token, router, load]),
  );

  const filtered = useMemo(() => {
    if (!orders) return null;
    return orders.filter((o) =>
      matchesOrderFilter(filter, {
        orderStatus: o.orderStatus,
        deliveryStatus: o.deliveryStatus,
        trackingStatus: o.trackingStatus,
      }),
    );
  }, [orders, filter]);

  const renderItem = ({ item }: { item: PurchaseOrder }) => {
    const img = item.listingImages?.[0] ?? null;
    const status = listStatusLabel(item);
    return (
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/orders/${item.id}`)}
      >
        {img ? (
          <Image source={{ uri: img }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Feather name="package" size={20} color="#94A3B8" />
          </View>
        )}
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={2}>
            {item.listingTitle}
          </Text>
          <Text style={styles.sub}>
            {orderRef(item.id)} · {formatDate(item.createdAt)}
          </Text>
          <Text style={styles.price}>
            {formatMoney(item.amount, item.currency)}
            {item.sellerName ? ` · ${item.sellerName}` : ""}
          </Text>
          <View style={[styles.badge, { backgroundColor: status.bg }]}>
            <Text style={[styles.badgeText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color="#94A3B8" />
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.topTitle}>My orders</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.filters}>
        {ORDER_FILTERS.map((key) => {
          const on = filter === key;
          return (
            <Pressable
              key={key}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => setFilter(key)}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {ORDER_FILTER_LABELS[key]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {authLoading || (token && orders === null && !error) ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => load("initial")}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: insets.bottom + 24,
            flexGrow: 1,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load("refresh")}
              tintColor="#F97316"
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="shopping-bag" size={40} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>
                {orders && orders.length > 0
                  ? "No orders in this filter"
                  : "No orders yet"}
              </Text>
              <Text style={styles.emptySub}>
                {user
                  ? "When you buy with Flexa Wallet or card, orders appear here."
                  : "Sign in to view your purchases."}
              </Text>
              <Pressable
                style={styles.retry}
                onPress={() => router.replace("/")}
              >
                <Text style={styles.retryText}>Browse marketplace</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  topTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  filters: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  chipText: { fontSize: 13, fontWeight: "700", color: "#475569" },
  chipTextOn: { color: "#FFFFFF" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: "#E2E8F0" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  meta: { flex: 1, gap: 3 },
  title: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  sub: { fontSize: 12, color: "#64748B" },
  price: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  badge: {
    alignSelf: "flex-start",
    marginTop: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: "800" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10,
    minHeight: 280,
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  emptySub: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
  error: { color: "#B91C1C", textAlign: "center", fontWeight: "700" },
  retry: {
    marginTop: 8,
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontWeight: "800" },
});
