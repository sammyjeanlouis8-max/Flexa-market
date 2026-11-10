/**
 * Super Admin / admin support management — analytics, filters, assign.
 * Server requireRole(admin/support) enforces authorization.
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
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  assignSupportThread,
  fetchSupportAnalytics,
  fetchSupportAvailability,
  fetchSupportThreads,
  type SupportAnalytics,
  type SupportAvailability,
  type SupportThread,
} from "@/lib/supportApi";
import { canAssignSupportTickets, isSupportStaff } from "@/lib/supportRoles";

export default function SupportAdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState<SupportThread[] | null>(null);
  const [analytics, setAnalytics] = useState<SupportAnalytics | null>(null);
  const [availability, setAvailability] = useState<SupportAvailability | null>(null);
  const [status, setStatus] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const [threads, an, av] = await Promise.all([
          fetchSupportThreads({
            token,
            all: true,
            status: status || undefined,
            q: q.trim() || undefined,
          }),
          fetchSupportAnalytics({ token }),
          fetchSupportAvailability({ token }).catch(() => null),
        ]);
        let next = threads;
        if (priorityFilter) {
          next = threads.filter((r) => (r.priority || "normal") === priorityFilter);
        }
        setRows(next);
        setAnalytics(an);
        setAvailability(av);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("supportLoadErr"));
        setRows((prev) => prev ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token, status, q, priorityFilter, t],
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

  const onAssignToMe = async (thread: SupportThread) => {
    if (!token || !user?.id || !canAssignSupportTickets(user)) {
      Alert.alert(t("supportTitle"), t("supportAssignForbidden"));
      return;
    }
    try {
      await assignSupportThread(thread.id, user.id, { token });
      await load("refresh");
    } catch (e) {
      Alert.alert(t("supportTitle"), e instanceof Error ? e.message : "Error");
    }
  };

  const onUnassign = async (thread: SupportThread) => {
    if (!token || !canAssignSupportTickets(user)) {
      Alert.alert(t("supportTitle"), t("supportAssignForbidden"));
      return;
    }
    try {
      await assignSupportThread(thread.id, null, { token });
      await load("refresh");
    } catch (e) {
      Alert.alert(t("supportTitle"), e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>{t("supportAdminDesk")}</Text>
        <View style={{ width: 40 }} />
      </View>

      {analytics ? (
        <View style={styles.grid}>
          <Metric label={t("supportStatTotal")} value={analytics.total} />
          <Metric label={t("supportStatOpen")} value={analytics.open} />
          <Metric label={t("supportStatPending")} value={analytics.pendingFirstResponse ?? 0} />
          <Metric label={t("supportStatOverdue")} value={analytics.overdue ?? 0} />
          <Metric label={t("supportStatResolved")} value={analytics.resolved ?? analytics.closed ?? 0} />
          <Metric
            label={t("supportStatCsat")}
            value={
              analytics.customerSatisfaction?.average != null
                ? `${analytics.customerSatisfaction.average} (${analytics.customerSatisfaction.responses})`
                : "—"
            }
          />
          <Metric
            label={t("supportStatAvgResp")}
            value={
              analytics.avgFirstResponseMin != null
                ? `${Math.round(analytics.avgFirstResponseMin)}m`
                : "—"
            }
          />
          <Metric label={t("supportAgentsOnline")} value={analytics.agentsOnline ?? 0} />
        </View>
      ) : null}

      {availability?.agents?.length ? (
        <View style={styles.agentsBox}>
          <Text style={styles.section}>{t("supportOnlineAgents")}</Text>
          {availability.agents.map((a) => (
            <Text key={a.id} style={styles.agentLine}>
              {a.name} {a.role ? `(${a.role})` : ""}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => void load("initial")}
          placeholder={t("supportSearchTickets")}
          placeholderTextColor="#94A3B8"
        />
      </View>

      <View style={styles.filters}>
        {["", "open", "in_progress", "waiting_customer", "closed"].map((s) => (
          <Pressable
            key={s || "all"}
            style={[styles.chip, status === s && styles.chipOn]}
            onPress={() => setStatus(s)}
          >
            <Text style={[styles.chipText, status === s && styles.chipTextOn]}>
              {s || t("allCategories")}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.filters}>
        {["", "normal", "high", "urgent"].map((p) => (
          <Pressable
            key={p || "p-all"}
            style={[styles.chip, priorityFilter === p && styles.chipOn]}
            onPress={() => setPriorityFilter(p)}
          >
            <Text style={[styles.chipText, priorityFilter === p && styles.chipTextOn]}>
              {p || t("supportPriority")}
            </Text>
          </Pressable>
        ))}
      </View>

      {rows === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={rows ?? []}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor="#F97316" />
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 8 }}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable style={{ flex: 1 }} onPress={() => router.push(`/support/${item.id}`)}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.subject}</Text>
                <Text style={styles.rowSub}>
                  {item.ticketRef || `#${item.id}`} · {item.status} · {item.priority}
                </Text>
                <Text style={styles.rowSub}>
                  {item.userName} → {item.assignedAdminName || t("supportUnassigned")}
                </Text>
                {item.estimatedResponseLabel ? (
                  <Text style={styles.rowSub}>{t("supportEta")}: {item.estimatedResponseLabel}</Text>
                ) : null}
              </Pressable>
              {canAssignSupportTickets(user) ? (
                <View style={{ gap: 6 }}>
                  <Pressable style={styles.assign} onPress={() => void onAssignToMe(item)}>
                    <Text style={styles.assignText}>{t("supportAssignMe")}</Text>
                  </Pressable>
                  {item.assignedAdminId ? (
                    <Pressable style={styles.unassign} onPress={() => void onUnassign(item)}>
                      <Text style={styles.unassignText}>{t("supportUnassign")}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricVal}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, marginBottom: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontWeight: "800", fontSize: 17, color: "#0F172A" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  metric: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
  },
  metricVal: { fontWeight: "900", color: "#0F172A", fontSize: 16 },
  metricLabel: { color: "#64748B", fontSize: 11, marginTop: 2 },
  agentsBox: { marginHorizontal: 16, marginBottom: 8, backgroundColor: "#ECFDF5", borderRadius: 10, padding: 10 },
  section: { fontWeight: "800", color: "#047857", marginBottom: 4 },
  agentLine: { color: "#065F46", fontSize: 12 },
  searchRow: { marginHorizontal: 16, marginBottom: 8 },
  search: {
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    color: "#0F172A",
  },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#64748B" },
  chipTextOn: { color: "#fff" },
  row: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },
  rowTitle: { fontWeight: "800", color: "#0F172A" },
  rowSub: { color: "#64748B", fontSize: 12, marginTop: 2 },
  assign: { backgroundColor: "#F97316", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  assignText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  unassign: { backgroundColor: "#F1F5F9", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  unassignText: { color: "#0F172A", fontWeight: "700", fontSize: 11 },
  error: { color: "#DC2626", marginBottom: 8 },
});
