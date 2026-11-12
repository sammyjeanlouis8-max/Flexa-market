/**
 * Commission + platform revenue (Super Admin read).
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAdminCommissionSummary, fetchAdminPlatformRevenue } from "@/lib/adminApi";
import { isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminCommissionsScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [summary, setSummary] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [s, r] = await Promise.all([
        fetchAdminCommissionSummary({ token }).catch(() => null),
        fetchAdminPlatformRevenue({ token, period: "month" }).catch(() => null),
      ]);
      setSummary(s);
      setRevenue(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
    } finally {
      setRefreshing(false);
    }
  }, [token, t]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoading && !token) { router.replace("/auth/login"); return; }
      if (token && !isSuperAdminUser(user)) { router.replace("/admin"); return; }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  const entries = [
    ...Object.entries(summary || {}).filter(([, v]) => typeof v === "number" || typeof v === "string").slice(0, 8),
    ...Object.entries(revenue || {}).filter(([, v]) => typeof v === "number" || typeof v === "string").slice(0, 8),
  ];

  return (
    <AdminShell
      title={t("adminCommissions")}
      loading={!summary && !revenue && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); void load(); }}
    >
      <Text style={adminStyles.cardSub}>{t("adminCommissionsNote")}</Text>
      <View style={adminStyles.metricGrid}>
        {entries.map(([k, v]) => (
          <View key={k} style={adminStyles.metric}>
            <Text style={adminStyles.metricVal}>{String(v)}</Text>
            <Text style={adminStyles.metricLabel}>{k}</Text>
          </View>
        ))}
      </View>
      {!entries.length ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
