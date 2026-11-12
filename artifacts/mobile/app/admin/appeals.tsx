/**
 * Admin appeals
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { decideAppeal, fetchAdminAppeals } from "@/lib/adminApi";
import { canModerate, canManageUsersHard, isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminAppealsScreen() {
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
      setRows(await fetchAdminAppeals({ token }));
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
      title={t("adminAppeals")}
      loading={rows === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); void load(); }}
    >
      <></>
      {(rows ?? []).map((r, i) => (
        <View key={r.id ?? i} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{`${r.targetType} #${r.targetId}`}</Text>
          <Text style={adminStyles.cardSub}>{r.status || "pending"}</Text>
          {r.status === "pending" && canManageUsersHard(user) ? (
            <View style={[adminStyles.row, { marginTop: 8 }]}>
              <Pressable style={adminStyles.btn} onPress={() => token && void decideAppeal(r.id, "uphold", "upheld", { token }).then(load).catch((e) => Alert.alert(t("adminAppeals"), e.message))}>
                <Text style={adminStyles.btnText}>{t("adminUphold")}</Text>
              </Pressable>
              <Pressable style={adminStyles.btnGhost} onPress={() => token && void decideAppeal(r.id, "overturn", "overturned", { token }).then(load).catch((e) => Alert.alert(t("adminAppeals"), e.message))}>
                <Text style={adminStyles.btnGhostText}>{t("adminOverturn")}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
      {rows?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
