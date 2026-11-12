/**
 * Admin dashboard — role-gated tabs using /api/admin/*
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, formatWhen, money } from "@/lib/request";

type Tab = "overview" | "users" | "moderation" | "finance" | "support";

export default function AdminScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { token, user, isLoading: authLoading } = useAuth();
  const initial = (params.tab as Tab) || "overview";
  const [tab, setTab] = useState<Tab>(
    ["overview", "users", "moderation", "finance", "support"].includes(initial) ? initial : "overview",
  );
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [moderation, setModeration] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const allowed = !!(user?.isAdmin || user?.isSuperAdmin || user?.role === "moderator" || user?.role === "support");

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token || !allowed) return;
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const adminMe = await apiRequest("/admin/me", { token }).catch(() => null);
        setMe(adminMe);
        if (tab === "overview") {
          setStats(await apiRequest("/admin/stats", { token }));
        } else if (tab === "users") {
          const res = await apiRequest<any>("/admin/users?limit=50", { token });
          setUsers(Array.isArray(res) ? res : res.users ?? res.items ?? []);
        } else if (tab === "moderation") {
          const res = await apiRequest<any>("/admin/moderation?limit=50", { token });
          setModeration(Array.isArray(res) ? res : res.items ?? res.reports ?? []);
        } else if (tab === "finance") {
          const res = await apiRequest<any>("/admin/payments?limit=50", { token });
          setPayments(Array.isArray(res) ? res : res.payments ?? res.items ?? []);
        } else if (tab === "support") {
          const res = await apiRequest<any[]>("/support/threads?all=1", { token });
          setThreads(Array.isArray(res) ? res : []);
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Admin API error");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, allowed, tab],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (!authLoading && token && !allowed) {
        return;
      }
      if (token && allowed) void load();
    }, [authLoading, token, allowed, router, load]),
  );

  const tabs = useMemo(
    () =>
      [
        { id: "overview" as const, label: "Overview", icon: "grid" as const },
        { id: "users" as const, label: "Users", icon: "users" as const },
        { id: "moderation" as const, label: "Moderation", icon: "flag" as const },
        { id: "finance" as const, label: "Finance", icon: "dollar-sign" as const },
        { id: "support" as const, label: "Support", icon: "life-buoy" as const },
      ] as const,
    [],
  );

  if (!authLoading && token && !allowed) {
    return (
      <View style={styles.root}>
        <AppHeader title="Admin" showBack />
        <View style={styles.center}>
          <Feather name="shield-off" size={36} color="#94A3B8" />
          <Text style={styles.denyTitle}>Access denied</Text>
          <Text style={styles.denySub}>Admin or support role required.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader title="Admin" showBack showCart={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {tabs.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.tab, tab === t.id && styles.tabOn]}
            onPress={() => setTab(t.id)}
          >
            <Feather name={t.icon} size={14} color={tab === t.id ? "#fff" : "#64748B"} />
            <Text style={[styles.tabText, tab === t.id && { color: "#fff" }]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={colors.flexaGreen} />
          }
        >
          {me ? (
            <Text style={styles.role}>
              Signed in as {me.name} · {me.role}
            </Text>
          ) : null}
          {error ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retry}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {tab === "overview" && stats ? (
            <View style={styles.grid}>
              {[
                ["Users", stats.totalUsers ?? stats.users ?? "—"],
                ["Listings", stats.totalListings ?? stats.listings ?? "—"],
                ["Active", stats.activeListings ?? "—"],
                ["Reports", stats.pendingReports ?? "—"],
                ["Banned", stats.bannedUsers ?? "—"],
                ["Visits today", stats.visitsToday ?? "—"],
              ].map(([label, value]) => (
                <View key={String(label)} style={styles.stat}>
                  <Text style={styles.statLabel}>{label}</Text>
                  <Text style={styles.statValue}>{String(value)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {tab === "users"
            ? users.map((u) => (
                <View key={u.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{u.name || u.email}</Text>
                    <Text style={styles.meta}>
                      {u.email} · {u.country || "—"}
                      {u.isBanned ? " · banned" : ""}
                    </Text>
                  </View>
                </View>
              ))
            : null}

          {tab === "moderation"
            ? (moderation.length ? moderation : []).map((m, i) => (
                <View key={m.id ?? i} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{m.reason || m.type || m.status || "Report"}</Text>
                    <Text style={styles.meta}>{formatWhen(m.createdAt)}</Text>
                  </View>
                </View>
              ))
            : null}

          {tab === "finance"
            ? payments.map((p, i) => (
                <View key={p.id ?? i} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{p.type || p.status || "Payment"}</Text>
                    <Text style={styles.meta}>{formatWhen(p.createdAt)}</Text>
                  </View>
                  <Text style={styles.amt}>{money(p.amountUsd ?? p.amount ?? 0)}</Text>
                </View>
              ))
            : null}

          {tab === "support"
            ? threads.map((t) => (
                <Pressable key={t.id} style={styles.row} onPress={() => router.push(`/support/${t.id}`)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>
                      #{t.ticketRef || t.id} · {t.subject}
                    </Text>
                    <Text style={styles.meta}>
                      {t.status} · {t.userName || ""}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="#94A3B8" />
                </Pressable>
              ))
            : null}

          {!error && tab !== "overview" &&
          ((tab === "users" && !users.length) ||
            (tab === "moderation" && !moderation.length) ||
            (tab === "finance" && !payments.length) ||
            (tab === "support" && !threads.length)) ? (
            <Text style={styles.empty}>No records for this tab.</Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  denyTitle: { fontWeight: "800", fontSize: 16, color: colors.light.text },
  denySub: { color: "#94A3B8", textAlign: "center" },
  tabs: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    marginRight: 8,
  },
  tabOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  tabText: { fontWeight: "700", color: "#64748B", fontSize: 12 },
  role: { color: "#64748B", marginBottom: 10, fontSize: 12 },
  banner: { backgroundColor: "#FEF2F2", padding: 10, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: "#B91C1C" },
  retry: { color: colors.flexaGreen, fontWeight: "700", marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
  },
  statLabel: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  statValue: { marginTop: 4, fontSize: 20, fontWeight: "900", color: colors.light.text },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { fontWeight: "700", color: colors.light.text },
  meta: { color: "#64748B", fontSize: 12, marginTop: 2 },
  amt: { fontWeight: "800", color: colors.flexaGreen },
  empty: { color: "#94A3B8", marginTop: 12 },
});
