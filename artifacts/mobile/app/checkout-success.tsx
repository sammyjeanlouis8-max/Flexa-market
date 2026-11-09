/**
 * Order confirmation after successful POST /api/cart/checkout.
 */
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CheckoutOrder } from "@/lib/checkoutApi";

export default function CheckoutSuccessScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orders: ordersRaw, deliveryTotal: deliveryRaw } = useLocalSearchParams<{
    orders?: string;
    deliveryTotal?: string;
  }>();

  const orders: CheckoutOrder[] = useMemo(() => {
    try {
      const parsed = JSON.parse(String(ordersRaw || "[]"));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [ordersRaw]);

  const deliveryTotal = Number(deliveryRaw || 0) || 0;
  const productTotal = orders.reduce((s, o) => s + Number(o.amount || 0), 0);
  const grandTotal = Math.round((productTotal + deliveryTotal) * 100) / 100;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: Math.max(insets.bottom, 24) + 24,
          alignItems: "center",
        }}
      >
        <View style={styles.iconWrap}>
          <Feather name="check-circle" size={40} color="#059669" />
        </View>
        <Text style={styles.title}>Order confirmed</Text>
        <Text style={styles.sub}>
          {orders.length || 0} item(s) paid with Flexa Wallet
        </Text>
        {deliveryTotal > 0 ? (
          <Text style={styles.shipBadge}>
            Shipping ${deliveryTotal.toFixed(2)}
          </Text>
        ) : null}

        <View style={styles.list}>
          {orders.map((o) => (
            <View key={o.txId} style={styles.row}>
              <View style={styles.pkg}>
                <Feather name="package" size={18} color="#F97316" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {o.title}
                </Text>
                <Text style={styles.rowMeta}>
                  #{o.txId} · ${Number(o.amount).toFixed(2)}
                  {(o.deliveryFee ?? 0) > 0
                    ? ` · ship $${Number(o.deliveryFee).toFixed(2)}`
                    : ""}
                </Text>
              </View>
              <Text style={styles.paid}>Paid</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Products</Text>
            <Text style={styles.feeValue}>${productTotal.toFixed(2)}</Text>
          </View>
          {deliveryTotal > 0 ? (
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Shipping</Text>
              <Text style={styles.feeValue}>${deliveryTotal.toFixed(2)}</Text>
            </View>
          ) : null}
          <View style={styles.feeRow}>
            <Text style={styles.totalLabel}>Total paid</Text>
            <Text style={styles.totalValue}>${grandTotal.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.replace("/orders")}
          >
            <Text style={styles.primaryBtnText}>View orders</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.secondaryBtnText}>Continue shopping</Text>
          </Pressable>
          <Pressable
            style={styles.linkBtn}
            onPress={() => router.push("/delivery-tracking")}
          >
            <Text style={styles.linkBtnText}>Delivery tracking</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#D1FAE5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
  sub: { fontSize: 14, color: "#64748B", marginTop: 4, marginBottom: 8 },
  shipBadge: {
    backgroundColor: "#EFF6FF",
    color: "#1D4ED8",
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 16,
  },
  list: { width: "100%", gap: 8, marginTop: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  pkg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FFF7ED",
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  rowMeta: { fontSize: 12, color: "#64748B", marginTop: 2 },
  paid: {
    fontSize: 11,
    fontWeight: "800",
    color: "#047857",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
  },
  totals: {
    width: "100%",
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 8,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  feeLabel: { color: "#64748B", fontSize: 13, fontWeight: "600" },
  feeValue: { color: "#0F172A", fontSize: 14, fontWeight: "800" },
  totalLabel: { color: "#0F172A", fontSize: 15, fontWeight: "900" },
  totalValue: { color: "#F97316", fontSize: 18, fontWeight: "900" },
  actions: { width: "100%", gap: 10, marginTop: 20 },
  primaryBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: "#0F172A", fontWeight: "800", fontSize: 15 },
  linkBtn: { alignItems: "center", paddingVertical: 8 },
  linkBtnText: { color: "#F97316", fontWeight: "700", fontSize: 14 },
});
