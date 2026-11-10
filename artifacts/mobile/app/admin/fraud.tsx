/**
 * Fraud dashboard + alerts (admin).
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAdminFraudAlerts, fetchAdminFraudDashboard } from "@/lib/adminApi";
import { isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminFraudScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [dash, setDash] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [d, a] = await Promise.all([
        fetchAdminFraudDashboard({ token }),
        fetchAdminFraudAlerts({ token }),
      ]);
      setDash(d);
      setAlerts(a);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
      setAlerts((p) => p ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [token, t]);

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

  const metrics = dash && typeof dash === "object" ? Object.entries(dash).filter(([, v]) => typeof v === "number").slice(0, 6) : [];

  return (
    <AdminShell
      title={t("adminFraud")}
      loading={alerts === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); void load(); }}
    >
      {metrics.length ? (
        <View style={adminStyles.metricGrid}>
          {metrics.map(([k, v]) => (
            <View key={k} style={adminStyles.metric}>
              <Text style={adminStyles.metricVal}>{v as number}</Text>
              <Text style={adminStyles.metricLabel}>{k}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={adminStyles.section}>{t("adminFraudAlerts")}</Text>
      {(alerts ?? []).map((a, i) => (
        <View key={a.id ?? i} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{a.type || a.rule || a.title || `alert #${a.id || i}`}</Text>
          <Text style={adminStyles.cardSub}>{[a.status, a.severity, a.userEmail || a.userId].filter(Boolean).join(" · ")}</Text>
        </View>
      ))}
      {alerts?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
