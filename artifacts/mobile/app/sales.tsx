import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { fetchSalesDashboard } from "@/lib/salesApi";

export default function SalesScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchSalesDashboard({ token })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) {
    return (
      <View style={styles.root}>
        <AppHeader title="Sales" showBrand={false} showBack showMenu={false} />
        <View style={styles.center}>
          <Text style={styles.msg}>Sign in to view seller sales.</Text>
          <Pressable style={styles.btn} onPress={() => router.push("/auth/login")}>
            <Text style={styles.btnText}>Log in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader title="My Sales & Statistics" showBrand={false} showBack showMenu={false} />
      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <ActivityIndicator color={colors.flexaGreen} />
        ) : error ? (
          <Text style={styles.msg}>{error}</Text>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>Revenue</Text>
              <Text style={styles.value}>
                ${Number(data?.revenueUsd ?? data?.totalRevenue ?? data?.revenue ?? 0).toFixed(2)}
              </Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>Orders</Text>
              <Text style={styles.value}>{Number(data?.ordersCount ?? data?.orders ?? 0)}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>Active listings</Text>
              <Text style={styles.value}>{Number(data?.activeListings ?? data?.listings ?? 0)}</Text>
            </View>
            <Pressable style={styles.btn} onPress={() => router.push("/orders")}>
              <Text style={styles.btnText}>Open orders</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.secondary]} onPress={() => router.push("/analytics")}>
              <Text style={[styles.btnText, { color: colors.flexaGreen }]}>Analytics</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  body: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
  },
  label: { color: "#64748B", fontWeight: "600" },
  value: { marginTop: 6, fontSize: 28, fontWeight: "800", color: colors.flexaGreen },
  msg: { color: "#64748B", textAlign: "center" },
  btn: {
    backgroundColor: colors.flexaGreen,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondary: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: colors.flexaGreen },
  btnText: { color: "#FFFFFF", fontWeight: "800" },
});
