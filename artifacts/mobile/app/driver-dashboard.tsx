/**
 * Driver dashboard — available deliveries + stats
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, formatWhen, money } from "@/lib/request";

type Delivery = {
  id: number;
  status?: string;
  pickupCity?: string | null;
  deliveryCity?: string | null;
  priceUsd?: number | null;
  feeUsd?: number | null;
  trackingNumber?: string | null;
  createdAt?: string;
};

export default function DriverDashboardScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<"available" | "mine">("available");
  const [available, setAvailable] = useState<Delivery[] | null>(null);
  const [mine, setMine] = useState<Delivery[] | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [appStatus, setAppStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const app = await apiRequest<any>("/driver/my-application", { token }).catch(() => null);
        setAppStatus(app?.driver?.status || app?.application?.status || null);
        const [av, my, st] = await Promise.all([
          apiRequest<any>("/delivery/available", { token }).catch(() => []),
          apiRequest<any>("/delivery/my", { token }).catch(() => []),
          apiRequest<any>("/delivery/driver/stats", { token }).catch(() => null),
        ]);
        setAvailable(Array.isArray(av) ? av : av.deliveries ?? av.items ?? []);
        setMine(Array.isArray(my) ? my : my.deliveries ?? my.items ?? []);
        setStats(st);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load dashboard");
      } finally {
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load();
    }, [authLoading, token, router, load]),
  );

  const accept = async (id: number) => {
    if (!token) return;
    setBusyId(id);
    try {
      await apiRequest(`/delivery/${id}/accept`, { token, method: "POST", body: {} });
      Alert.alert("Accepted", "Delivery assigned to you.");
      await load();
      setTab("mine");
    } catch (e) {
      Alert.alert("Accept failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusyId(null);
    }
  };

  const list = tab === "available" ? available : mine;

  return (
    <View style={styles.root}>
      <AppHeader title="Driver dashboard" showBack />
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Status</Text>
          <Text style={styles.statValue}>{appStatus || "—"}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Deliveries</Text>
          <Text style={styles.statValue}>{stats?.deliveryCount ?? stats?.completed ?? "—"}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Earnings</Text>
          <Text style={styles.statValue}>{money(stats?.earningsTotal ?? stats?.earnings ?? 0)}</Text>
        </View>
      </View>
      <View style={styles.tabs}>
        {(["available", "mine"] as const).map((t) => (
          <Pressable key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && { color: "#fff" }]}>
              {t === "available" ? "Available" : "My jobs"}
            </Text>
          </Pressable>
        ))}
      </View>
      {list === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={list ?? []}
          keyExtractor={(d) => String(d.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={colors.flexaGreen} />
          }
          contentContainerStyle={!(list && list.length) ? { flexGrow: 1, justifyContent: "center", padding: 24 } : { padding: 16 }}
          ListHeaderComponent={
            error ? (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>{error}</Text>
              </View>
            ) : appStatus && appStatus !== "approved" && appStatus !== "active" ? (
              <Pressable style={styles.banner} onPress={() => router.push("/driver-apply")}>
                <Text style={styles.bannerText}>Application status: {appStatus}. Tap to review.</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="truck" size={32} color="#94A3B8" />
              <Text style={styles.empty}>No deliveries here</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.route}>
                {item.pickupCity || "Pickup"} → {item.deliveryCity || "Dropoff"}
              </Text>
              <Text style={styles.meta}>
                {item.status?.replace(/_/g, " ")} · {formatWhen(item.createdAt)}
              </Text>
              {item.trackingNumber ? <Text style={styles.meta}>{item.trackingNumber}</Text> : null}
              <Text style={styles.pay}>{money(item.priceUsd ?? item.feeUsd ?? 0)}</Text>
              {tab === "available" ? (
                <Pressable
                  style={[styles.btn, busyId === item.id && { opacity: 0.6 }]}
                  disabled={busyId === item.id}
                  onPress={() => void accept(item.id)}
                >
                  <Text style={styles.btnText}>{busyId === item.id ? "Accepting…" : "Accept"}</Text>
                </Pressable>
              ) : item.trackingNumber ? (
                <Pressable onPress={() => router.push(`/track/${item.trackingNumber}`)}>
                  <Text style={styles.link}>Track</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  stats: { flexDirection: "row", gap: 8, padding: 12 },
  stat: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 10,
  },
  statLabel: { fontSize: 11, color: "#94A3B8", fontWeight: "700" },
  statValue: { marginTop: 4, fontWeight: "800", color: colors.light.text, textTransform: "capitalize" },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 12 },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    alignItems: "center",
    justifyContent: "center",
  },
  tabOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  tabText: { fontWeight: "700", color: "#64748B" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  banner: { backgroundColor: "#FEF2F2", padding: 10, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: "#B91C1C" },
  empty: { color: "#94A3B8", fontWeight: "600" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 10,
  },
  route: { fontWeight: "800", color: colors.light.text },
  meta: { color: "#64748B", fontSize: 12, marginTop: 4, textTransform: "capitalize" },
  pay: { marginTop: 8, fontWeight: "800", color: colors.flexaGreen, fontSize: 16 },
  btn: {
    marginTop: 12,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  link: { marginTop: 10, color: colors.flexaGreen, fontWeight: "800" },
});
