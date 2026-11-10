import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAdminAuditLogs, fetchAdminAuditStats, fetchAdminLogs } from "@/lib/adminApi";
import { canModerate, isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminAuditScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [tab, setTab] = useState<"audit" | "logs">("audit");
  const [stats, setStats] = useState<any>(null);
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      if (tab === "audit") {
        const [st, logs] = await Promise.all([
          fetchAdminAuditStats({ token }).catch(() => null),
          fetchAdminAuditLogs({ token }),
        ]);
        setStats(st);
        setRows(logs.items);
      } else {
        setStats(null);
        setRows(await fetchAdminLogs({ token }));
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
      setRows((p) => p ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [token, tab, t]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoading && !token) { router.replace("/auth/login"); return; }
      if (token && !canModerate(user) && !user?.isAdmin && !isSuperAdminUser(user)) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  return (
    <AdminShell
      title={t("adminAudit")}
      loading={rows === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); void load(); }}
    >
      <View style={[adminStyles.row, { flexWrap: "wrap" }]}>
        <Pressable
          style={[adminStyles.chip, tab === "audit" && adminStyles.chipOn]}
          onPress={() => setTab("audit")}
        >
          <Text style={[adminStyles.chipText, tab === "audit" && adminStyles.chipTextOn]}>
            {t("adminAuditTrail")}
          </Text>
        </Pressable>
        <Pressable
          style={[adminStyles.chip, tab === "logs" && adminStyles.chipOn]}
          onPress={() => setTab("logs")}
        >
          <Text style={[adminStyles.chipText, tab === "logs" && adminStyles.chipTextOn]}>
            {t("adminActionLogs")}
          </Text>
        </Pressable>
      </View>
      {stats && typeof stats === "object" ? (
        <View style={adminStyles.metricGrid}>
          {Object.entries(stats)
            .filter(([, v]) => typeof v === "number")
            .slice(0, 4)
            .map(([k, v]) => (
              <View key={k} style={adminStyles.metric}>
                <Text style={adminStyles.metricVal}>{v as number}</Text>
                <Text style={adminStyles.metricLabel}>{k}</Text>
              </View>
            ))}
        </View>
      ) : null}
      {(rows ?? []).slice(0, 150).map((r, i) => (
        <View key={r.id ?? i} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>
            {r.action || r.event || r.type || `entry #${r.id || i}`}
          </Text>
          <Text style={adminStyles.cardSub}>
            {r.actorName || r.adminName || r.userId || ""}
            {r.targetType ? ` · ${r.targetType}` : ""}
            {r.targetId ? ` #${r.targetId}` : ""}
          </Text>
          {r.details || r.message || r.note ? (
            <Text style={adminStyles.cardSub} numberOfLines={3}>
              {String(r.details || r.message || r.note)}
            </Text>
          ) : null}
          <Text style={adminStyles.cardSub}>{r.createdAt || r.timestamp || ""}</Text>
        </View>
      ))}
      {rows?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
