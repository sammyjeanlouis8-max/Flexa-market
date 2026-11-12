/**
 * Admin operations queue
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAdminActionQueue } from "@/lib/adminApi";
import { canModerate, isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminOperationsScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState<any[] | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchAdminActionQueue({ token });
      setRows(data.items);
      setMeta(data.counts);
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
      if (token && !(canModerate(user) || user?.isAdmin || isSuperAdminUser(user))) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  return (
    <AdminShell
      title={t("adminOperations")}
      loading={rows === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); void load(); }}
    >
      {meta ? (
        <Text style={adminStyles.section}>
          total {meta.total ?? rows?.length ?? 0}
          {meta.reports != null ? ` · reports ${meta.reports}` : ""}
          {meta.listings != null ? ` · listings ${meta.listings}` : ""}
          {meta.users != null ? ` · users ${meta.users}` : ""}
        </Text>
      ) : null}
      {(rows ?? []).map((r, i) => (
        <View key={r.id ?? i} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{r.data?.title || r.data?.name || r.data?.subject || r.data?.reason || `${r.type} #${r.id}`}</Text>
          <Text style={adminStyles.cardSub}>{[r.type, r.priority, r.country, r.risk].filter(Boolean).join(" · ")}</Text>
          
        </View>
      ))}
      {rows?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
