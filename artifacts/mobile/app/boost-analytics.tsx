import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { fetchBoostAnalytics, type BoostAnalyticsSummary } from "@/lib/boostApi";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";

export default function BoostAnalyticsScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<BoostAnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchBoostAnalytics({ token })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [token]);

  if (!token) {
    return (
      <View style={styles.root}>
        <AppHeader title="Boost Analytics" showBrand={false} showBack showMenu={false} />
        <View style={styles.center}>
          <Text style={styles.msg}>Sign in required.</Text>
          <Pressable style={styles.btn} onPress={() => router.push("/auth/login")}>
            <Text style={styles.btnText}>Log in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader title="Boost Analytics" showBrand={false} showBack showMenu={false} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.flexaGreen} />
      ) : error ? (
        <Text style={styles.msg}>{error}</Text>
      ) : (
        <FlatList
          data={data?.campaigns ?? []}
          keyExtractor={(c) => String(c.boostId)}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListHeaderComponent={
            <View style={styles.totals}>
              <Text style={styles.totalLabel}>Totals</Text>
              <Text style={styles.totalValue}>
                Imp {Number(data?.totals?.impressions ?? 0)} · Clicks{" "}
                {Number(data?.totals?.clicks ?? 0)}
              </Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.msg}>No campaign analytics yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>
                {item.status} · CTR {(Number(item.ctr || 0) * 100).toFixed(1)}%
              </Text>
              <Text style={styles.meta}>
                Spend ${Number(item.spend || 0).toFixed(2)} / ${Number(item.budget || 0).toFixed(2)}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  btn: { backgroundColor: colors.flexaGreen, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 },
  btnText: { color: "#FFF", fontWeight: "800" },
  msg: { textAlign: "center", color: "#64748B", marginTop: 24 },
  totals: {
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  totalLabel: { fontWeight: "700", color: colors.flexaGreen },
  totalValue: { marginTop: 4, fontWeight: "800", color: "#0F172A" },
  card: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, padding: 14, gap: 4 },
  title: { fontWeight: "800", color: "#0F172A" },
  meta: { color: "#64748B", fontSize: 13 },
});
