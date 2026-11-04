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

import { SignInGate } from "@/components/SignInGate";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/apiFetch";

type ManagerMe = { role?: string; storeName?: string; sellerId?: number; [key: string]: unknown };
type ManagerOrder = {
  id: number;
  status?: string;
  orderStatus?: string;
  listingTitle?: string;
};

export default function ManagerScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const [me, setMe] = useState<ManagerMe | null>(null);
  const [orders, setOrders] = useState<ManagerOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [profile, list] = await Promise.all([
        apiFetch<ManagerMe>("/manager/me", { token }),
        apiFetch<ManagerOrder[] | { orders?: ManagerOrder[] }>("/manager/orders", {
          token,
        }).catch(() => []),
      ]);
      setMe(profile);
      setOrders(Array.isArray(list) ? list.slice(0, 40) : list.orders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load manager desk");
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
        <Text style={[styles.title, { color: colors.foreground }]}>Store manager</Text>
        <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>
          Native manager desk for web `/manager` using /api/manager/*.
        </Text>

        {!token ? (
          <SignInGate message="Sign in with a manager account." />
        ) : error ? (
          <Text style={{ color: "#F87171" }}>{error}</Text>
        ) : loading && !me ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View style={[styles.card, { borderColor: colors.border }]}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Profile</Text>
              <Text style={{ color: colors.foreground, fontWeight: "700", marginTop: 4 }}>
                {String(me?.storeName || me?.role || "Manager")}
              </Text>
            </View>
            <Text style={[styles.section, { color: colors.foreground }]}>Orders</Text>
            {orders.length === 0 ? (
              <Text style={{ color: colors.mutedForeground }}>No manager orders.</Text>
            ) : (
              orders.map((o) => (
                <Pressable
                  key={o.id}
                  onPress={() => router.push(`/orders/${o.id}`)}
                  style={[styles.row, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                    {o.listingTitle || `Order #${o.id}`}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
                    {o.orderStatus || o.status || "open"}
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
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  section: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  row: { borderWidth: 1, borderRadius: 12, padding: 14 },
});
