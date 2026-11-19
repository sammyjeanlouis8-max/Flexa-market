/**
 * Jobs board — GET /api/jobs, POST /api/jobs/:id/apply
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

type Job = {
  id: number;
  title: string;
  description?: string;
  city?: string | null;
  country?: string | null;
  budgetUsd?: number | null;
  payAmount?: number | null;
  status?: string;
  createdAt?: string;
  posterName?: string | null;
};

export default function JobsScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [applying, setApplying] = useState<number | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const data = await apiRequest<Job[]>("/jobs", { token });
        setJobs(Array.isArray(data) ? data : []);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load jobs");
        setJobs((p) => p ?? []);
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

  const apply = async (id: number) => {
    if (!token) return;
    setApplying(id);
    try {
      await apiRequest(`/jobs/${id}/apply`, { token, method: "POST", body: {} });
      Alert.alert("Applied", "Your application was submitted.");
      await load();
    } catch (e) {
      Alert.alert("Could not apply", e instanceof Error ? e.message : "Try again");
    } finally {
      setApplying(null);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Jobs" showBack />
      {jobs === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={jobs ?? []}
          keyExtractor={(j) => String(j.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={colors.flexaGreen} />
          }
          contentContainerStyle={!(jobs && jobs.length) ? { flexGrow: 1, justifyContent: "center", padding: 24 } : { padding: 16 }}
          ListHeaderComponent={
            error ? (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>{error}</Text>
              </View>
            ) : (
              <Text style={styles.intro}>Open gigs near you. Apply directly from the board.</Text>
            )
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="briefcase" size={36} color="#94A3B8" />
              <Text style={styles.empty}>No open jobs right now</Text>
              <Text style={styles.sub}>Pull to refresh or check back later.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const pay = item.budgetUsd ?? item.payAmount;
            return (
              <View style={styles.card}>
                <Text style={styles.title}>{item.title}</Text>
                {item.description ? (
                  <Text style={styles.desc} numberOfLines={3}>
                    {item.description}
                  </Text>
                ) : null}
                <View style={styles.meta}>
                  <Text style={styles.metaText}>
                    {[item.city, item.country].filter(Boolean).join(", ") || "Location TBD"}
                  </Text>
                  {pay != null ? <Text style={styles.pay}>{money(pay)}</Text> : null}
                </View>
                <Text style={styles.when}>{formatWhen(item.createdAt)}</Text>
                <Pressable
                  style={[styles.btn, applying === item.id && { opacity: 0.6 }]}
                  onPress={() => void apply(item.id)}
                  disabled={applying === item.id}
                >
                  <Text style={styles.btnText}>{applying === item.id ? "Applying…" : "Apply"}</Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  intro: { color: "#64748B", marginBottom: 12, fontSize: 13 },
  banner: { backgroundColor: "#FEF2F2", padding: 10, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: "#B91C1C", fontSize: 13 },
  empty: { fontWeight: "800", color: colors.light.text, marginTop: 8 },
  sub: { color: "#94A3B8", textAlign: "center" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: "800", color: colors.light.text },
  desc: { marginTop: 6, color: "#475569", lineHeight: 20, fontSize: 13 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  metaText: { color: "#64748B", fontSize: 12, flex: 1 },
  pay: { fontWeight: "800", color: colors.flexaGreen },
  when: { marginTop: 4, fontSize: 11, color: "#94A3B8" },
  btn: {
    marginTop: 12,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
});
