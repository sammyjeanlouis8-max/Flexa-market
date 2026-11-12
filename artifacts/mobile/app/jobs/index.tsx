/**
 * Native Jobs home — browse, mine, applications tabs.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  fetchJobs,
  fetchMyJobApplications,
  fetchMyJobs,
  type Job,
  type JobApplication,
} from "@/lib/jobsApi";

type Tab = "browse" | "mine" | "applications";

export default function JobsHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("browse");
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [apps, setApps] = useState<JobApplication[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        if (tab === "applications") {
          setApps(await fetchMyJobApplications({ token }));
          setJobs([]);
        } else if (tab === "mine") {
          setJobs(await fetchMyJobs({ token }));
        } else {
          setJobs(await fetchJobs({ token }));
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load jobs");
        setJobs((prev) => prev ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token, tab],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load("initial");
    }, [authLoading, token, router, load]),
  );

  const filtered = (jobs ?? []).filter((j) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      j.title.toLowerCase().includes(q) ||
      (j.description || "").toLowerCase().includes(q) ||
      (j.location || "").toLowerCase().includes(q)
    );
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Jobs</Text>
        <Pressable style={styles.back} onPress={() => router.push("/jobs/post")}>
          <Feather name="plus" size={18} color="#0F172A" />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(["browse", "mine", "applications"] as Tab[]).map((t) => (
          <Pressable key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {tab !== "applications" ? (
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search jobs"
          placeholderTextColor="#94A3B8"
        />
      ) : null}

      {jobs === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : tab === "applications" ? (
        <FlatList
          data={apps}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor="#F97316" />}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={<Text style={styles.empty}>No applications yet.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/jobs/${item.job_id}`)}>
              <Text style={styles.cardTitle}>{item.job_title || `Job #${item.job_id}`}</Text>
              <Text style={styles.meta}>
                {[item.status, item.poster_name].filter(Boolean).join(" · ")}
              </Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor="#F97316" />}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={<Text style={styles.empty}>No jobs found.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/jobs/${item.id}`)}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.meta} numberOfLines={2}>{item.description}</Text>
              <Text style={styles.meta}>
                {[item.location, item.budget != null ? `$${item.budget}` : null, item.status]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  back: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  tabs: { flexDirection: "row", gap: 6, paddingHorizontal: 16, marginTop: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#E2E8F0" },
  tabOn: { backgroundColor: "#FFF7ED" },
  tabText: { fontWeight: "700", fontSize: 12, color: "#475569", textTransform: "capitalize" },
  tabTextOn: { color: "#EA580C" },
  search: {
    marginHorizontal: 16, marginTop: 10, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#fff",
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: "#0F172A",
  },
  error: { color: "#B91C1C", fontWeight: "600", marginBottom: 8 },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 40 },
  card: {
    backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 8, gap: 4,
  },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  meta: { color: "#64748B", fontSize: 12 },
});
