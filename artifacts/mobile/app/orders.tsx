import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SignInGate } from "@/components/SignInGate";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/apiFetch";

type Order = {
  id: number;
  amount: number;
  currency: string;
  orderStatus: string;
  paymentStatus: string;
  listingTitle: string;
  sellerName: string | null;
  createdAt: string;
};

type Tab = "purchases" | "sales";

export default function OrdersScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("purchases");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const path = tab === "purchases" ? "/orders/purchases" : "/orders/sales";
      const data = await apiFetch<Order[]>(path, { token });
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [token, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.mutedForeground }}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Orders</Text>
        <Text style={{ color: colors.mutedForeground }}>
          Native purchases and sales from the same API as the website.
        </Text>
        <View style={styles.tabs}>
          {(["purchases", "sales"] as Tab[]).map((key) => (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={[
                styles.tab,
                {
                  borderColor: colors.border,
                  backgroundColor:
                    tab === key ? colors.primary : "transparent",
                },
              ]}
            >
              <Text
                style={{
                  color: tab === key ? "#0F172A" : colors.foreground,
                  fontWeight: "700",
                  textTransform: "capitalize",
                }}
              >
                {key}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {!token ? (
        <View style={styles.pad}>
          <SignInGate message="Sign in to view your orders." />
        </View>
      ) : error ? (
        <View style={styles.pad}>
          <Text style={{ color: "#F87171" }}>{error}</Text>
          <Pressable onPress={() => void load()} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void load()} />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>
                No {tab} yet.
              </Text>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/orders/${item.id}`)}
              style={[styles.row, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontWeight: "700" }} numberOfLines={1}>
                {item.listingTitle || `Order #${item.id}`}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
                #{item.id} · {item.orderStatus} · {item.paymentStatus}
              </Text>
              <Text style={{ color: colors.foreground, marginTop: 6, fontWeight: "600" }}>
                {Number(item.amount).toFixed(2)} {item.currency}
                {item.sellerName ? ` · ${item.sellerName}` : ""}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, gap: 8 },
  title: { fontSize: 28, fontWeight: "700" },
  tabs: { flexDirection: "row", gap: 8, marginTop: 4, marginBottom: 8 },
  tab: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  pad: { padding: 20 },
  list: { padding: 20, gap: 10, paddingBottom: 40 },
  row: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
});
