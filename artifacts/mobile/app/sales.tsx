/**
 * Native Sales dashboard — GET /api/sales/dashboard
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
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
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { formatMoney } from "@/lib/orderUi";
import { fetchSalesDashboard, type SalesDashboard } from "@/lib/salesApi";

type Period = "overview" | "day" | "week" | "month" | "year";

export default function SalesScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [period, setPeriod] = useState<Period>("overview");
  const [data, setData] = useState<SalesDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const dash = await fetchSalesDashboard(
          { token },
          { period, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        );
        setData(dash);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load sales");
      } finally {
        setRefreshing(false);
      }
    },
    [token, period],
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

  const cards = data?.cards;
  const currency = data?.currency || "USD";

  return (
    <View style={styles.root}>
      <AppHeader title="Sales" showBrand={false} showBack showCart={false} />
      <View style={styles.tabs}>
        {(["overview", "day", "week", "month", "year"] as Period[]).map((p) => (
          <Pressable
            key={p}
            style={[styles.tab, period === p && styles.tabOn]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.tabText, period === p && styles.tabTextOn]}>{p}</Text>
          </Pressable>
        ))}
      </View>

      {!data && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.pad}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.flexaGreen}
            />
          }
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.grid}>
            <MoneyCard title="Total" card={cards?.total} currency={currency} />
            <MoneyCard title="Today" card={cards?.today} currency={currency} />
            <MoneyCard title="Week" card={cards?.week} currency={currency} />
            <MoneyCard title="Month" card={cards?.month} currency={currency} />
          </View>

          <Text style={styles.section}>Top products</Text>
          {(data?.topProducts || []).length === 0 ? (
            <Text style={styles.empty}>No product sales in this period.</Text>
          ) : (
            (data?.topProducts || []).map((p) => (
              <Pressable
                key={p.listingId}
                style={styles.row}
                onPress={() => router.push(`/listing/${p.listingId}`)}
              >
                {p.image ? (
                  <Image source={{ uri: p.image }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Feather name="package" size={16} color="#94A3B8" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Text style={styles.rowSub}>
                    {p.units} sold · {formatMoney(p.revenue, currency)}
                  </Text>
                </View>
              </Pressable>
            ))
          )}

          <Text style={styles.section}>Recent sales</Text>
          {(data?.recentSales || []).length === 0 ? (
            <Text style={styles.empty}>No recent sales.</Text>
          ) : (
            (data?.recentSales || []).slice(0, 20).map((s) => (
              <Pressable
                key={s.id}
                style={styles.row}
                onPress={() => router.push(`/orders/${s.id}`)}
              >
                {s.image ? (
                  <Image source={{ uri: s.image }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Feather name="shopping-bag" size={16} color="#94A3B8" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {s.title || `Order #${s.id}`}
                  </Text>
                  <Text style={styles.rowSub}>
                    {s.buyerName || "Buyer"} · {s.orderStatus} ·{" "}
                    {formatMoney(s.amount, s.currency || currency)}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function MoneyCard({
  title,
  card,
  currency,
}: {
  title: string;
  card?: { amount: number; orders: number; changePct: number | null };
  currency: string;
}) {
  return (
    <View style={styles.moneyCard}>
      <Text style={styles.moneyLabel}>{title}</Text>
      <Text style={styles.moneyValue}>{formatMoney(card?.amount ?? 0, currency)}</Text>
      <Text style={styles.moneySub}>{card?.orders ?? 0} orders</Text>
      {card?.changePct != null ? (
        <Text
          style={[
            styles.moneyChange,
            { color: card.changePct >= 0 ? "#15803D" : "#B91C1C" },
          ]}
        >
          {card.changePct >= 0 ? "+" : ""}
          {card.changePct.toFixed(1)}%
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  tabs: { flexDirection: "row", paddingHorizontal: 8, paddingVertical: 10, gap: 4 },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
  },
  tabOn: { backgroundColor: colors.flexaGreen },
  tabText: { fontSize: 11, fontWeight: "700", color: "#475569", textTransform: "capitalize" },
  tabTextOn: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  pad: { padding: 16, paddingBottom: 48 },
  error: { color: "#B91C1C", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  moneyCard: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
  },
  moneyLabel: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  moneyValue: { marginTop: 6, fontSize: 18, fontWeight: "800", color: colors.flexaGreen },
  moneySub: { marginTop: 4, fontSize: 12, color: "#64748B" },
  moneyChange: { marginTop: 4, fontSize: 12, fontWeight: "700" },
  section: {
    marginTop: 22,
    marginBottom: 10,
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 10,
    marginBottom: 8,
  },
  thumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: "#E2E8F0" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  rowSub: { marginTop: 2, fontSize: 12, color: "#64748B" },
  empty: { color: "#64748B", marginBottom: 8 },
});
