import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { getApiBase } from "@/lib/api";

export default function DriverDashboardScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${getApiBase()}/delivery/deliveries`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
        const rows = Array.isArray(data) ? data : data.deliveries || data.jobs || [];
        setJobs(rows);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [token]);

  if (!token) {
    return (
      <View style={styles.root}>
        <AppHeader title="Driver" showBrand={false} showBack />
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
      <AppHeader title="Driver dashboard" showBrand={false} showBack />
      <View style={styles.toolbar}>
        <Pressable style={styles.secondary} onPress={() => router.push("/driver-apply")}>
          <Text style={styles.secondaryText}>Application status / apply</Text>
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.flexaGreen} />
      ) : error ? (
        <Text style={styles.msg}>{error}</Text>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j, i) => String(j.id ?? i)}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          ListEmptyComponent={<Text style={styles.msg}>No available deliveries right now.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.title}>Delivery #{item.id}</Text>
              <Text style={styles.meta}>{item.status || "available"}</Text>
              <Text style={styles.meta}>{item.city || item.pickupCity || ""} → {item.dropoffCity || ""}</Text>
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
  toolbar: { padding: 12 },
  btn: { backgroundColor: colors.flexaGreen, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 },
  btnText: { color: "#FFF", fontWeight: "800" },
  secondary: { borderWidth: 1, borderColor: colors.flexaGreen, borderRadius: 12, padding: 12, alignItems: "center" },
  secondaryText: { color: colors.flexaGreen, fontWeight: "800" },
  card: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, padding: 14, gap: 4 },
  title: { fontWeight: "800", color: "#0F172A" },
  meta: { color: "#64748B" },
  msg: { textAlign: "center", color: "#64748B", marginTop: 24 },
});
