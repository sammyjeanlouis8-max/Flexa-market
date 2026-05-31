import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Platform, RefreshControl,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

interface Order {
  id: number;
  status: string;
  total?: number;
  amount?: number;
  createdAt: string;
  buyerId?: number;
  sellerId?: number;
  listing?: { id: number; title: string; price: number; images?: string[] };
  buyer?: { id: number; name: string };
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  confirmed: "#6366F1",
  shipped: "#3B82F6",
  delivered: "#22C55E",
  completed: "#22C55E",
  cancelled: "#EF4444",
  refunded: "#94A3B8",
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}

export default function SalesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSales = useCallback(async () => {
    try {
      const data = await request<{ orders?: Order[] } | Order[]>("/orders?role=seller&limit=50");
      const list = Array.isArray(data) ? data : (data as any).orders ?? [];
      setOrders(list);
    } catch { setOrders([]); }
  }, [request]);

  useEffect(() => { fetchSales().finally(() => setLoading(false)); }, [fetchSales]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSales();
    setRefreshing(false);
  }, [fetchSales]);

  const total = orders.filter((o) => o.status === "completed" || o.status === "delivered").reduce((acc, o) => acc + Number(o.total ?? o.amount ?? 0), 0);
  const pending = orders.filter((o) => o.status === "pending").length;

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (loading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>📈 Ventes</Text>
      </View>

      <View style={[styles.summaryRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.accent }]}>${total.toFixed(2)}</Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Total Vann</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>{orders.length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Kòmand Total</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: "#F59E0B" }]}>{pending}</Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Kap Tann</Text>
        </View>
      </View>

      {orders.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 48 }}>📈</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Okenn vant</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Pibliye annons pou kòmanse vann</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const statusColor = STATUS_COLORS[item.status] ?? "#94A3B8";
            const img = item.listing?.images?.[0];
            return (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push(`/orders/${item.id}`)}
                activeOpacity={0.85}
              >
                <View style={styles.cardRow}>
                  {img ? (
                    <Image source={{ uri: img }} style={styles.cardImg} contentFit="cover" />
                  ) : (
                    <View style={[styles.cardImg, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
                      <Feather name="package" size={20} color={colors.mutedForeground} />
                    </View>
                  )}
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{item.listing?.title ?? `Kòmand #${item.id}`}</Text>
                    {item.buyer && <Text style={[styles.cardBuyer, { color: colors.mutedForeground }]}>Achetè: {item.buyer.name}</Text>}
                    <View style={styles.cardBottom}>
                      <Text style={[styles.cardAmount, { color: colors.accent }]}>${Number(item.total ?? item.amount ?? 0).toFixed(2)}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
                      </View>
                      <Text style={[styles.timeText, { color: colors.mutedForeground }]}>{timeAgo(item.createdAt)}</Text>
                    </View>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold" },
  summaryRow: { flexDirection: "row", paddingVertical: 16, borderBottomWidth: 1 },
  summaryItem: { flex: 1, alignItems: "center", gap: 4 },
  summaryValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  summaryDivider: { width: 1, marginVertical: 4 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  card: { borderRadius: 14, borderWidth: 1, padding: 12 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardImg: { width: 64, height: 64, borderRadius: 10 },
  cardInfo: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 19 },
  cardBuyer: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  timeText: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
