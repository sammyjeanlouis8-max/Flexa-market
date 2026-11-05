/**
 * Native seller dashboard entry — sales orders + links to listings/boosts.
 */
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NavLink } from "@/components/NavLink";
import { SignInGate } from "@/components/SignInGate";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/apiFetch";

type SaleOrder = {
  id: number;
  amount: number;
  currency: string;
  orderStatus: string;
  listingTitle?: string;
};

export default function SalesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const [sales, setSales] = useState<SaleOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SaleOrder[]>("/orders/sales", { token });
      setSales(Array.isArray(data) ? data.slice(0, 30) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sales");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} />
        }
      >
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.mutedForeground }}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Seller dashboard
        </Text>
        <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>
          Native seller hub using the same sales and listing APIs as the website.
        </Text>

        {!token ? (
          <SignInGate message="Sign in to manage your seller account." />
        ) : (
          <>
            <View style={{ gap: 10 }}>
              <NavLink href="/my-listings" label="My listings" />
              <NavLink href="/my-boosts" label="My boosts" />
              <NavLink href="/orders" label="All orders" />
              <NavLink href="/subscription" label="Seller subscription" />
            </View>

            <Text style={[styles.section, { color: colors.foreground }]}>
              Recent sales
            </Text>
            {error ? <Text style={{ color: "#F87171" }}>{error}</Text> : null}
            {loading && sales.length === 0 ? (
              <ActivityIndicator color={colors.primary} />
            ) : sales.length === 0 ? (
              <Text style={{ color: colors.mutedForeground }}>No sales yet.</Text>
            ) : (
              sales.map((sale) => (
                <Pressable
                  key={sale.id}
                  onPress={() => router.push(`/orders/${sale.id}`)}
                  style={[styles.row, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                    {sale.listingTitle || `Sale #${sale.id}`}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
                    {sale.orderStatus} · {Number(sale.amount).toFixed(2)} {sale.currency}
                  </Text>
                </Pressable>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: "700" },
  section: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  row: { borderWidth: 1, borderRadius: 12, padding: 14 },
});
