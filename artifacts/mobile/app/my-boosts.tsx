import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { fetchActiveBoosts, type ActiveBoost } from "@/lib/boostApi";

export default function MyBoostsScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [rows, setRows] = useState<ActiveBoost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchActiveBoosts({ token })
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [token]);

  if (!token) {
    return (
      <View style={styles.root}>
        <AppHeader title="My Boosts" showBrand={false} showBack showMenu={false} />
        <View style={styles.center}>
          <Text style={styles.msg}>Sign in to view boosts.</Text>
          <Pressable style={styles.btn} onPress={() => router.push("/auth/login")}>
            <Text style={styles.btnText}>Log in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader title="My Active Boosts" showBrand={false} showBack showMenu={false} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.flexaGreen} />
      ) : error ? (
        <Text style={styles.msg}>{error}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.boostId)}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListEmptyComponent={<Text style={styles.msg}>No active boosts.</Text>}
          ListHeaderComponent={
            <Pressable style={styles.btn} onPress={() => router.push("/boost-analytics")}>
              <Text style={styles.btnText}>Boost Analytics</Text>
            </Pressable>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/listing/${item.listingId}`)}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>
                Impressions {item.impressions} · Clicks {item.clicks}
              </Text>
              <Text style={styles.meta}>
                {item.isExpired ? "Expired" : "Active"} · Budget ${Number(item.budget || 0).toFixed(2)}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  btn: {
    backgroundColor: colors.flexaGreen,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  btnText: { color: "#FFFFFF", fontWeight: "800" },
  msg: { textAlign: "center", color: "#64748B", marginTop: 24 },
  card: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  title: { fontWeight: "800", color: "#0F172A" },
  meta: { color: "#64748B", fontSize: 13 },
});
