/**
 * Native Support Agent desk — assigned queue, unassigned, availability toggle.
 * Server RBAC (requireRole support) enforces access.
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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  fetchSupportAnalytics,
  fetchSupportAvailability,
  fetchSupportThreads,
  setMySupportAvailability,
  type SupportAnalytics,
  type SupportThread,
} from "@/lib/supportApi";
import { agentDisplayName, canAssignSupportTickets, isSupportStaff } from "@/lib/supportRoles";

type Filter = "all" | "open" | "in_progress" | "waiting_customer" | "closed" | "mine" | "unassigned";

export default function SupportAgentDeskScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState<SupportThread[] | null>(null);
  const [analytics, setAnalytics] = useState<SupportAnalytics | null>(null);
  const [available, setAvailable] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const status =
          filter === "mine" || filter === "unassigned" || filter === "all" ? undefined : filter;
        const data = await fetchSupportThreads({
          token,
          all: true,
          status,
          q: q.trim() || undefined,
          adminId: filter === "mine" && user?.id ? user.id : filter === "unassigned" ? undefined : undefined,
        });
        let next = data;
        if (filter === "mine" && user?.id) {
          next = data.filter((r) => r.assignedAdminId === user.id);
        } else if (filter === "unassigned") {
          next = data.filter((r) => !r.assignedAdminId && r.status !== "closed");
        }
        setRows(next);
        const [an, av] = await Promise.all([
          fetchSupportAnalytics({ token }).catch(() => null),
          fetchSupportAvailability({ token }).catch(() => null),
        ]);
        setAnalytics(an);
        if (av && user?.id) {
          setAvailable(av.agents.some((a) => a.id === user.id) || av.agentsOnline > 0);
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("supportLoadErr"));
        setRows((prev) => prev ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token, filter, q, user?.id, t],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && !isSupportStaff(user)) {
        router.replace("/support");
        return;
      }
      if (token) void load("initial");
    }, [authLoading, token, user, router, load]),
  );

  React.useEffect(() => {
    if (token && isSupportStaff(user)) void load("initial");
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const onToggleAvail = async (value: boolean) => {
    if (!token) return;
    setAvailable(value);
    try {
      await setMySupportAvailability(value, { token });
    } catch {
      setAvailable(!value);
    }
  };

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: t("allCategories") },
    { id: "mine", label: t("supportAssignedToMe") },
    { id: "unassigned", label: t("supportUnassigned") },
    { id: "open", label: "open" },
    { id: "in_progress", label: "in_progress" },
    { id: "waiting_customer", label: "waiting" },
    { id: "closed", label: "closed" },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>{t("supportAgentDesk")}</Text>
        {canAssignSupportTickets(user) ? (
          <Pressable style={styles.back} onPress={() => router.push("/support-admin")}>
            <Feather name="bar-chart-2" size={18} color="#0F172A" />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <View style={styles.agentCard}>
        <Text style={styles.agentName}>{agentDisplayName(user)}</Text>
        <View style={styles.availRow}>
          <Text style={styles.availLabel}>{t("supportAvailable")}</Text>
          <Switch value={available} onValueChange={(v) => void onToggleAvail(v)} />
        </View>
      </View>

      {analytics ? (
        <View style={styles.stats}>
          <Stat label={t("supportStatOpen")} value={analytics.open} />
          <Stat label={t("supportStatPending")} value={analytics.pendingFirstResponse ?? 0} />
          <Stat label={t("supportStatOverdue")} value={analytics.overdue ?? 0} />
          <Stat
            label={t("supportStatCsat")}
            value={analytics.customerSatisfaction?.average ?? "—"}
          />
        </View>
      ) : null}

      <View style={styles.searchRow}>
        <Feather name="search" size={16} color="#64748B" />
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => void load("initial")}
          placeholder={t("supportSearchTickets")}
          placeholderTextColor="#94A3B8"
          returnKeyType="search"
        />
      </View>

      <FlatList
        horizontal
        data={filters}
        keyExtractor={(f) => f.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.chip, filter === item.id && styles.chipOn]}
            onPress={() => setFilter(item.id)}
          >
            <Text style={[styles.chipText, filter === item.id && styles.chipTextOn]}>{item.label}</Text>
          </Pressable>
        )}
      />

      {rows === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={rows ?? []}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor="#F97316" />
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 8 }}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={<Text style={styles.empty}>{t("supportNoTickets")}</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/support/${item.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.subject}</Text>
                <Text style={styles.rowSub}>
                  {item.ticketRef || `#${item.id}`} · {item.status} · {item.priority || "normal"}
                </Text>
                <Text style={styles.rowSub}>
                  {item.userName || "Customer"}
                  {item.assignedAdminName ? ` → ${item.assignedAdminName}` : ` → ${t("supportUnassigned")}`}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color="#94A3B8" />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, marginBottom: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontWeight: "800", fontSize: 17, color: "#0F172A" },
  agentCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },
  agentName: { fontWeight: "900", color: "#0F172A", fontSize: 16 },
  availRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  availLabel: { fontWeight: "700", color: "#64748B" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  stat: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
  },
  statVal: { fontWeight: "900", color: "#0F172A", fontSize: 18 },
  statLabel: { color: "#64748B", fontSize: 11, marginTop: 2 },
  searchRow: {
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
  },
  search: { flex: 1, color: "#0F172A" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  chipTextOn: { color: "#fff" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },
  rowTitle: { fontWeight: "800", color: "#0F172A" },
  rowSub: { color: "#64748B", fontSize: 12, marginTop: 2 },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 24 },
  error: { color: "#DC2626", marginBottom: 8 },
});
