/**
 * Native available / my deliveries — closes the inventory gap for
 * web `/delivery/deliveries` (previously missing on Expo).
 */
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

type DeliveryJob = {
  id: number | string;
  status?: string;
  listingTitle?: string;
  title?: string;
  feeUsd?: number;
  amount?: number;
};

type Tab = "available" | "mine";

export default function DeliveriesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("available");
  const [jobs, setJobs] = useState<DeliveryJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const path = tab === "available" ? "/delivery/available" : "/delivery/my";
      const data = await apiFetch<DeliveryJob[] | { deliveries?: DeliveryJob[] }>(
        path,
        { token },
      );
      setJobs(Array.isArray(data) ? data : data.deliveries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deliveries");
      setJobs([]);
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
        <Text style={[styles.title, { color: colors.foreground }]}>Deliveries</Text>
        <Text style={{ color: colors.mutedForeground }}>
          Native driver jobs from /api/delivery/available and /api/delivery/my.
        </Text>
        <View style={styles.tabs}>
          {(["available", "mine"] as Tab[]).map((key) => (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={[
                styles.tab,
                {
                  borderColor: colors.border,
                  backgroundColor: tab === key ? colors.primary : "transparent",
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
          <SignInGate message="Sign in to browse delivery jobs." />
        </View>
      ) : error ? (
        <Text style={{ color: "#F87171", padding: 20 }}>{error}</Text>
      ) : (
        <FlatList
          data={jobs}
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
                No deliveries in this list.
              </Text>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push("/delivery-tracking")}
              style={[styles.row, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                {item.listingTitle || item.title || `Delivery #${item.id}`}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
                {item.status || "open"}
                {item.feeUsd != null || item.amount != null
                  ? ` · $${Number(item.feeUsd ?? item.amount).toFixed(2)}`
                  : ""}
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
  tabs: { flexDirection: "row", gap: 8, marginBottom: 4 },
  tab: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  pad: { padding: 20 },
  list: { padding: 20, paddingBottom: 40 },
  row: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
});
