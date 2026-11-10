/**
 * Super Admin team / RBAC directory.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAdminTeam } from "@/lib/adminApi";
import { isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminTeamScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setRows(await fetchAdminTeam({ token }));
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
      if (token && !isSuperAdminUser(user)) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  return (
    <AdminShell
      title={t("adminTeam")}
      loading={rows === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); void load(); }}
    >
      <Text style={adminStyles.cardSub}>{t("adminTeamNote")}</Text>
      {(rows ?? []).map((a) => (
        <View key={a.id} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{a.name || a.email}</Text>
          <Text style={adminStyles.cardSub}>
            {a.email} · {(a.role || (a.isSuperAdmin ? "superadmin" : "admin")).toString()}
          </Text>
          <Text style={adminStyles.cardSub}>
            {[a.adminScopeCountry, a.adminScopeDepartment, a.adminScopeCity]
              .filter(Boolean)
              .join(" / ") || t("adminGlobalScope")}
          </Text>
        </View>
      ))}
      {rows?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
