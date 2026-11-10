import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { decideReport, fetchAdminReports } from "@/lib/adminApi";
import { canModerate } from "@/lib/adminRoles";

export default function AdminReportsScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setRows(await fetchAdminReports({ token }));
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
      if (token && !canModerate(user)) { router.replace("/admin"); return; }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  return (
    <AdminShell
      title={t("adminReports")}
      loading={rows === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); void load(); }}
    >
      {(rows ?? []).map((r) => (
        <View key={r.id} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>
            #{r.id} · {r.targetType || "report"} {r.targetId ? `#${r.targetId}` : ""}
          </Text>
          <Text style={adminStyles.cardSub}>{r.reason}</Text>
          <Text style={adminStyles.cardSub}>{r.status || "pending"} · {r.priority || "normal"}</Text>
          {(r.status === "pending" || !r.status) ? (
            <View style={[adminStyles.row, { marginTop: 8 }]}>
              <Pressable
                style={adminStyles.btn}
                onPress={() =>
                  token &&
                  void decideReport(r.id, "resolved", { token })
                    .then(load)
                    .catch((e) => Alert.alert(t("adminReports"), e.message))
                }
              >
                <Text style={adminStyles.btnText}>{t("adminResolve")}</Text>
              </Pressable>
              <Pressable
                style={adminStyles.btnGhost}
                onPress={() =>
                  token &&
                  void decideReport(r.id, "dismissed", { token })
                    .then(load)
                    .catch((e) => Alert.alert(t("adminReports"), e.message))
                }
              >
                <Text style={adminStyles.btnGhostText}>{t("adminDismiss")}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
      {rows?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
