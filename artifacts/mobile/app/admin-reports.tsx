/**
 * Native admin reports queue — list + resolve/dismiss.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { friendlyApiError } from "@/i18n/nativeScreens";
import {
  canAccessAdminHub,
  decideAdminReport,
  fetchAdminReports,
  type AdminReport,
} from "@/lib/adminApi";

export default function AdminReportsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const c = colors.light;
  const allowed = canAccessAdminHub(user);

  const [rows, setRows] = useState<AdminReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token || !allowed) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const list = await fetchAdminReports({ token });
        setRows(list);
        setError(null);
      } catch (e) {
        setError(
          friendlyApiError(e instanceof Error ? e.message : undefined, t) || t("admin_reports_loadError"),
        );
      } finally {
        setRefreshing(false);
      }
    },
    [token, allowed, t],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && allowed) void load("initial");
    }, [authLoading, token, allowed, router, load]),
  );

  const visible = useMemo(() => {
    const list = rows ?? [];
    if (filter === "pending") return list.filter((r) => r.status === "pending");
    return list;
  }, [rows, filter]);

  function decide(report: AdminReport, decision: "resolve" | "dismiss") {
    const resolution =
      decision === "resolve" ? t("admin_reports_defaultResolve") : t("admin_reports_defaultDismiss");
    Alert.alert(
      decision === "resolve" ? t("admin_reports_resolveTitle") : t("admin_reports_dismissTitle"),
      report.reason,
      [
        { text: t("common_ok"), style: "cancel" },
        {
          text: decision === "resolve" ? t("admin_reports_resolve") : t("admin_reports_dismiss"),
          style: decision === "dismiss" ? "destructive" : "default",
          onPress: async () => {
            if (!token) return;
            setBusyId(report.id);
            try {
              await decideAdminReport(report.id, decision, resolution, { token });
              await load("refresh");
            } catch (e) {
              Alert.alert(
                t("common_error"),
                friendlyApiError(e instanceof Error ? e.message : undefined, t),
              );
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }

  if (!authLoading && token && !allowed) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16, backgroundColor: c.background }]}>
        <Text style={styles.denied}>{t("admin_deniedBody")}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, backgroundColor: c.background }]} testID="admin-reports">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Feather name="arrow-left" size={20} color={c.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("admin_reports_title")}</Text>
          <Text style={styles.sub}>{t("admin_reports_subtitle")}</Text>
        </View>
      </View>

      <View style={styles.filters}>
        {(["pending", "all"] as const).map((key) => {
          const active = filter === key;
          return (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {key === "pending" ? t("admin_reports_pending") : t("admin_reports_all")}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load("initial")}>
            <Text style={styles.retry}>{t("common_retry")}</Text>
          </Pressable>
        </View>
      ) : null}

      {rows == null && !error ? (
        <ActivityIndicator color="#146C43" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 10 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor="#146C43" />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="inbox" size={28} color="#94A3B8" />
              <Text style={styles.emptyTitle}>{t("admin_reports_empty")}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const busy = busyId === item.id;
            const pending = item.status === "pending";
            return (
              <View style={styles.card} testID={`admin-report-${item.id}`}>
                <View style={styles.cardTop}>
                  <Text style={styles.target}>
                    {item.targetType} #{item.targetId}
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: pending ? "#FFEDD5" : item.status === "resolved" ? "#DCFCE7" : "#F1F5F9",
                      },
                    ]}
                  >
                    <Text style={styles.statusText}>{item.status}</Text>
                  </View>
                </View>
                <Text style={styles.reason}>{item.reason}</Text>
                <Text style={styles.meta}>
                  {item.reporterName}
                  {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleDateString()}` : ""}
                </Text>
                {pending ? (
                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.btn, styles.resolveBtn, busy && { opacity: 0.6 }]}
                      disabled={busy}
                      onPress={() => decide(item, "resolve")}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.btnText}>{t("admin_reports_resolve")}</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={[styles.btn, styles.dismissBtn, busy && { opacity: 0.6 }]}
                      disabled={busy}
                      onPress={() => decide(item, "dismiss")}
                    >
                      <Text style={[styles.btnText, { color: "#B91C1C" }]}>{t("admin_reports_dismiss")}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, marginBottom: 8 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 18, fontWeight: "900", color: "#0F172A" },
  sub: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  filters: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#146C43", borderColor: "#146C43" },
  chipText: { fontSize: 12, fontWeight: "800", color: "#334155" },
  chipTextActive: { color: "#fff" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 8,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  target: { fontSize: 13, fontWeight: "800", color: "#0F172A", textTransform: "capitalize" },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: "800", color: "#334155", textTransform: "uppercase" },
  reason: { fontSize: 13, color: "#334155", lineHeight: 18 },
  meta: { fontSize: 11, color: "#94A3B8", fontWeight: "600" },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  btn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  resolveBtn: { backgroundColor: "#146C43" },
  dismissBtn: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  empty: { alignItems: "center", paddingTop: 48, gap: 10 },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: "#64748B" },
  errorBox: { marginHorizontal: 16, marginBottom: 8, padding: 12, backgroundColor: "#FEF2F2", borderRadius: 10 },
  errorText: { color: "#B91C1C", fontWeight: "700", marginBottom: 6 },
  retry: { color: "#146C43", fontWeight: "800" },
  denied: { textAlign: "center", marginTop: 40, paddingHorizontal: 24, color: "#64748B", fontWeight: "700" },
});
