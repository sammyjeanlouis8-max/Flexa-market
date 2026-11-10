/**
 * Admin driver applications
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { decideDriverApplication, fetchAdminDriverApplications } from "@/lib/adminApi";
import { isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminDriversScreen() {
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
      setRows(await fetchAdminDriverApplications({ token, status: "pending" }));
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
      if (token && !(user?.isAdmin || isSuperAdminUser(user))) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  return (
    <AdminShell
      title={t("adminDrivers")}
      loading={rows === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); void load(); }}
    >
      <></>
      {(rows ?? []).map((r, i) => (
        <View key={r.id ?? i} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{`${r.firstName || ""} ${r.lastName || ""}`.trim() || r.userName || `#${r.id}`}</Text>
          <Text style={adminStyles.cardSub}>{[r.status, r.city, r.country, r.vehicleType].filter(Boolean).join(" · ")}</Text>
          {(r.status === "pending" || r.status === "needs_changes") ? (
            <View style={[adminStyles.row, { marginTop: 8 }]}>
              <Pressable style={adminStyles.btn} onPress={() => token && void decideDriverApplication(r.id, "approve", { token }).then(load).catch((e) => Alert.alert(t("adminDrivers"), e.message))}>
                <Text style={adminStyles.btnText}>{t("adminApprove")}</Text>
              </Pressable>
              <Pressable style={adminStyles.btnGhost} onPress={() => token && void decideDriverApplication(r.id, "reject", { token, adminNote: "rejected" }).then(load).catch((e) => Alert.alert(t("adminDrivers"), e.message))}>
                <Text style={adminStyles.btnGhostText}>{t("adminReject")}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
      {rows?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
