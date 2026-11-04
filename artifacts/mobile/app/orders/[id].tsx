import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SignInGate } from "@/components/SignInGate";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/apiFetch";

type OrderDetail = {
  id: number;
  amount: number;
  currency: string;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod?: string;
  trackingNumber?: string | null;
  carrier?: string | null;
  listingTitle?: string;
  createdAt?: string;
  deliveryStatus?: string | null;
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(orderId)) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<OrderDetail>(`/orders/${orderId}`, { token });
      setOrder(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [token, orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.mutedForeground }}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Order #{Number.isFinite(orderId) ? orderId : "—"}
        </Text>

        {!token ? (
          <SignInGate message="Sign in to view this order." />
        ) : loading && !order ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <Text style={{ color: "#F87171" }}>{error}</Text>
        ) : order ? (
          <View style={[styles.card, { borderColor: colors.border }]}>
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 17 }}>
              {order.listingTitle || `Order #${order.id}`}
            </Text>
            <Text style={styles.line}>Status: {order.orderStatus}</Text>
            <Text style={styles.line}>Payment: {order.paymentStatus}</Text>
            {order.paymentMethod ? (
              <Text style={styles.line}>Method: {order.paymentMethod}</Text>
            ) : null}
            <Text style={styles.line}>
              Amount: {Number(order.amount).toFixed(2)} {order.currency}
            </Text>
            {order.trackingNumber ? (
              <Text style={styles.line}>
                Tracking: {order.carrier || "Carrier"} {order.trackingNumber}
              </Text>
            ) : null}
            {order.deliveryStatus ? (
              <Text style={styles.line}>Delivery: {order.deliveryStatus}</Text>
            ) : null}
            {order.createdAt ? (
              <Text style={styles.line}>
                Created: {new Date(order.createdAt).toLocaleString()}
              </Text>
            ) : null}
            <Pressable
              onPress={() => router.push("/delivery-tracking")}
              style={[styles.cta, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.ctaText}>Delivery tracking</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 6 },
  line: { color: "#94A3B8", marginTop: 2 },
  cta: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  ctaText: { color: "#0F172A", fontWeight: "700" },
});
