import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAdminDeliveries, fetchAdminDeliveryList } from "@/lib/adminApi";
import { isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminDeliveriesScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [analytics, setAnalytics] = useState<any>(null);
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [an, list] = await Promise.all([
        fetchAdminDeliveries({ token }).catch(() => null),
        fetchAdminDeliveryList({ token }),
      ]);
      setAnalytics(an);
      setRows(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
      setRows((p) => p ?? []);
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

  return (
    <AdminShell
      title={t("adminDeliveries")}
      loading={rows === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); void load(); }}
    >
      <Text style={adminStyles.cardSub}>{t("adminDeliveryPinNote")}</Text>
      {analytics && typeof analytics === "object" ? (
        <View style={adminStyles.metricGrid}>
          {Object.entries(analytics)
            .filter(([, v]) => typeof v === "number")
            .slice(0, 6)
            .map(([k, v]) => (
              <View key={k} style={adminStyles.metric}>
                <Text style={adminStyles.metricVal}>{v as number}</Text>
                <Text style={adminStyles.metricLabel}>{k}</Text>
              </View>
            ))}
        </View>
      ) : null}
      {(rows ?? []).slice(0, 100).map((d) => (
        <View key={d.id} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>#{d.id} · {d.status}</Text>
          <Text style={adminStyles.cardSub}>
            {d.country || d.listingCountry || "—"}
            {d.department || d.commune ? ` · ${[d.department, d.commune].filter(Boolean).join("/")}` : ""}
          </Text>
          <Text style={adminStyles.cardSub}>
            {d.driverName || d.driver_user_name || t("adminNoDriver")}
            {d.verificationCode || d.verification_code ? ` · ${t("adminPinProtected")}` : ""}
          </Text>
        </View>
      ))}
      {rows?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
