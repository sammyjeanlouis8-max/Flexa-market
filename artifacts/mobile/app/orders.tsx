import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

type OrderStatus =
  | "pending"
  | "ready_to_ship"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled"
  | "return_refunded";

interface Order {
  id: number;
  listingId?: number;
  orderStatus: OrderStatus;
  amount: number;
  createdAt: string;
  listingTitle?: string;
  listingImages?: string[];
  sellerName?: string;
  buyerName?: string;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Annatant",
  ready_to_ship: "Pare pou ekspedye",
  shipped: "Ekspedye",
  delivered: "Livré",
  completed: "Konplète",
  cancelled: "Anile",
  return_refunded: "Retounen",
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: "#F59E0B",
  ready_to_ship: "#3B82F6",
  shipped: "#8B5CF6",
  delivered: "#22C55E",
  completed: "#22C55E",
  cancelled: "#EF4444",
  return_refunded: "#94A3B8",
};

type TabType = "buying" | "selling";

export default function OrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const { t } = useLanguage();
  const [tab, setTab] = useState<TabType>("buying");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const endpoint = tab === "buying" ? "/orders/purchases" : "/orders/sales";
      const data = await request<Order[]>(endpoint);
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setOrders([]);
    }
  }, [request, tab]);

  useEffect(() => {
    setLoading(true);
    fetchOrders().finally(() => setLoading(false));
  }, [fetchOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  const filtered = orders;

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("ordersTitle")}</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={[styles.tabs, { backgroundColor: colors.muted }]}>
          {(["buying", "selling"] as const).map((tabKey) => (
            <TouchableOpacity
              key={tabKey}
              style={[styles.tabBtn, tab === tabKey && { backgroundColor: colors.card, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }]}
              onPress={() => setTab(tabKey)}
            >
              <Text style={[styles.tabText, { color: tab === tabKey ? colors.foreground : colors.mutedForeground }]}>
                {tabKey === "buying" ? t("ordersBuying") : t("ordersSelling")}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="shopping-bag" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noOrders")}</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {t("noOrdersHint")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
              onPress={() => item.listingId && router.push({ pathname: "/listing/[id]", params: { id: item.listingId } })}
            >
              <View style={styles.cardTop}>
                <View style={[styles.iconBox, { backgroundColor: colors.muted }]}>
                  <Feather name="package" size={22} color={colors.primary} />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {item.listingTitle ?? `Kòmand #${item.id}`}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                    {tab === "buying" ? `Vandè: ${item.sellerName ?? "—"}` : `Achetè: ${item.buyerName ?? "—"}`}
                  </Text>
                </View>
                <Text style={[styles.amount, { color: colors.foreground }]}>${item.amount?.toFixed(2)}</Text>
              </View>
              <View style={styles.cardBottom}>
                <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLOR[item.orderStatus] ?? "#94A3B8") + "22", borderColor: (STATUS_COLOR[item.orderStatus] ?? "#94A3B8") + "55" }]}>
                  <View style={[styles.dot, { backgroundColor: STATUS_COLOR[item.orderStatus] ?? "#94A3B8" }]} />
                  <Text style={[styles.statusText, { color: STATUS_COLOR[item.orderStatus] ?? "#94A3B8" }]}>
                    {STATUS_LABEL[item.orderStatus] ?? item.orderStatus}
                  </Text>
                </View>
                <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
                  #{item.id} · {new Date(item.createdAt).toLocaleDateString("fr-FR")}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  tabs: { flexDirection: "row", borderRadius: 10, padding: 3 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8 },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  list: { padding: 16, gap: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  amount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  dateText: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
