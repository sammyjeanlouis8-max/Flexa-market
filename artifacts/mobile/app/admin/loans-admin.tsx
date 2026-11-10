/**
 * Admin loans queue
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAdminLoans } from "@/lib/adminApi";
import { canAccessFinance, isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminLoansScreen() {
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
      setRows(await fetchAdminLoans({ token }));
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
      if (token && !(canAccessFinance(user) || isSuperAdminUser(user))) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  return (
    <AdminShell
      title={t("adminLoans")}
      loading={rows === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); void load(); }}
    >
      <></>
      {(rows ?? []).map((r, i) => (
        <View key={r.id ?? i} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{`Loan #${r.id} · ${r.amountRequested ?? r.amount ?? "—"}`}</Text>
          <Text style={adminStyles.cardSub}>{[r.status, r.userName || r.email, r.termMonths ? `${r.termMonths} mo` : null].filter(Boolean).join(" · ")}</Text>
          
        </View>
      ))}
      {rows?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
