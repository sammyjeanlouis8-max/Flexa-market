import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAdminStats, fetchAdminTraffic } from "@/lib/adminApi";
import { isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminTrafficScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [period, setPeriod] = useState("30d");
  const [stats, setStats] = useState<any>(null);
  const [traffic, setTraffic] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [st, tr] = await Promise.all([
        fetchAdminStats({ token }),
        fetchAdminTraffic({ token, period }),
      ]);
      setStats(st);
      setTraffic(tr);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
    } finally {
      setRefreshing(false);
    }
  }, [token, period, t]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoading && !token) { router.replace("/auth/login"); return; }
      if (token && !user?.isAdmin && !isSuperAdminUser(user)) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  const series: any[] = Array.isArray(traffic?.days)
    ? traffic.days
    : Array.isArray(traffic?.series)
      ? traffic.series
      : Array.isArray(traffic)
        ? traffic
        : [];

  return (
    <AdminShell
      title={t("adminTraffic")}
      loading={!stats && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); void load(); }}
    >
      <View style={[adminStyles.row, { flexWrap: "wrap" }]}>
        {["today", "7d", "30d", "year"].map((p) => (
          <Pressable
            key={p}
            style={[adminStyles.chip, period === p && adminStyles.chipOn]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[adminStyles.chipText, period === p && adminStyles.chipTextOn]}>{p}</Text>
          </Pressable>
        ))}
      </View>
      {stats ? (
        <View style={adminStyles.metricGrid}>
          <View style={adminStyles.metric}>
            <Text style={adminStyles.metricVal}>{stats.visitsToday ?? "—"}</Text>
            <Text style={adminStyles.metricLabel}>{t("adminStatVisitsToday")}</Text>
          </View>
          <View style={adminStyles.metric}>
            <Text style={adminStyles.metricVal}>{stats.visitsMonth ?? "—"}</Text>
            <Text style={adminStyles.metricLabel}>{t("adminVisitsMonth")}</Text>
          </View>
          <View style={adminStyles.metric}>
            <Text style={adminStyles.metricVal}>{stats.totalUsers ?? "—"}</Text>
            <Text style={adminStyles.metricLabel}>{t("adminStatUsers")}</Text>
          </View>
          <View style={adminStyles.metric}>
            <Text style={adminStyles.metricVal}>{stats.activeSubscriptions ?? "—"}</Text>
            <Text style={adminStyles.metricLabel}>{t("adminSubscriptions")}</Text>
          </View>
        </View>
      ) : null}
      <Text style={adminStyles.section}>{t("adminTrafficSeries")}</Text>
      {series.slice(-30).map((d, i) => (
        <View key={d.date || d.day || i} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{d.date || d.day || `#${i + 1}`}</Text>
          <Text style={adminStyles.cardSub}>
            visits {d.visits ?? d.visitCount ?? d.count ?? "—"}
            {d.sessions != null ? ` · sessions ${d.sessions}` : ""}
            {d.registrations != null ? ` · regs ${d.registrations}` : ""}
          </Text>
        </View>
      ))}
      {!series.length ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
