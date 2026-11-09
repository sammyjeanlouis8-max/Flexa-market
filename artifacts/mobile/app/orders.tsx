import { StateView } from "@/components/StateView";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type OrderRow = {
  id: number;
  amount: number;
  currency?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  orderStatus?: string;
  trackingNumber?: string | null;
  carrier?: string | null;
  trackingStatus?: string | null;
  listingTitle?: string;
  listingImages?: string[] | null;
  sellerName?: string | null;
  buyerName?: string | null;
  deliveryStatus?: string | null;
  deliveryId?: number | null;
  cardRefundStatus?: string | null;
  createdAt?: string;
};

export default function OrdersScreen() {
  const { token, user, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<"purchases" | "sales">("purchases");
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useAndroidBack();

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const path = tab === "purchases" ? "/orders/purchases" : "/orders/sales";
      const res = await apiFetch(path, { token, auth: true });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error((data as any).error || `Failed (${res.status})`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Could not load orders.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, tab]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  if (!authLoading && (!token || !user)) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.pad}>
          <Text style={styles.brand}>Flexa Market</Text>
          <Text style={styles.title}>Orders</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/auth/login")}>
            <Text style={styles.primaryText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={20} color="#F8FAFC" />
        </Pressable>
        <Text style={styles.brand}>Flexa Market</Text>
        <Pressable style={styles.iconBtn} onPress={() => router.push("/cart")}>
          <Feather name="shopping-cart" size={18} color="#F8FAFC" />
        </Pressable>
      </View>
      <Text style={styles.title}>Orders</Text>
      <View style={styles.tabs}>
        {(["purchases", "sales"] as const).map((t) => (
          <Pressable
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "purchases" ? "Buying" : "Selling"}
            </Text>
          </Pressable>
        ))}
      </View>

      <StateView
        loading={loading}
        error={error}
        empty={!loading && !error && rows.length === 0}
        emptyTitle="No orders yet"
        onRetry={load}
      >
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const image = resolveMediaUrl(item.listingImages?.[0] ?? null);
            return (
              <Pressable style={styles.card} onPress={() => router.push(`/orders/${item.id}`)}>
                {image ? (
                  <Image source={{ uri: image }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Feather name="package" size={18} color="#64748B" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.listingTitle || `Order #${item.id}`}
                  </Text>
                  <Text style={styles.meta}>
                    {item.orderStatus || "—"} · {item.paymentMethod || "—"}
                    {item.deliveryStatus ? ` · delivery ${item.deliveryStatus}` : ""}
                  </Text>
                  <Text style={styles.amount}>
                    $ {Number(item.amount || 0).toLocaleString()}
                  </Text>
                  {item.trackingNumber ? (
                    <Text style={styles.track}>
                      {item.carrier || "Carrier"} {item.trackingNumber}
                      {item.trackingStatus ? ` · ${item.trackingStatus}` : ""}
                    </Text>
                  ) : null}
                  {item.cardRefundStatus ? (
                    <Text style={styles.refund}>Refund: {item.cardRefundStatus}</Text>
                  ) : null}
                </View>
                <Feather name="chevron-right" size={18} color="#64748B" />
              </Pressable>
            );
          }}
        />
      </StateView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  pad: { padding: 20, gap: 10 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 16, fontWeight: "800", color: "#F8FAFC" },
  title: {
    marginHorizontal: 16,
    marginTop: 4,
    fontSize: 22,
    fontWeight: "800",
    color: "#F97316",
  },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginVertical: 10 },
  tab: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#0F172A",
  },
  tabActive: { backgroundColor: "#F97316", borderColor: "#F97316" },
  tabText: { color: "#94A3B8", fontWeight: "700" },
  tabTextActive: { color: "#fff" },
  list: { padding: 16, paddingBottom: 40, gap: 8 },
  card: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
  },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: "#1E293B" },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  cardTitle: { color: "#F8FAFC", fontWeight: "700", fontSize: 14 },
  meta: { color: "#94A3B8", fontSize: 12, marginTop: 2, textTransform: "capitalize" },
  amount: { color: "#F97316", fontWeight: "800", marginTop: 4 },
  track: { color: "#CBD5E1", fontSize: 11, marginTop: 2 },
  refund: { color: "#FCD34D", fontSize: 11, marginTop: 2 },
  primary: {
    marginTop: 12,
    backgroundColor: "#F97316",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700" },
});
