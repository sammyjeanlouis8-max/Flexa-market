/**
 * Flagged users — from /admin/action-queue?type=user (no invented /admin/flagged).
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAdminFlaggedUsers, postAdminUserAction } from "@/lib/adminApi";
import { canModerate, isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminFlaggedScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setRows(await fetchAdminFlaggedUsers({ token }));
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
      if (!isLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && !canModerate(user) && !user?.isAdmin && !isSuperAdminUser(user)) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  return (
    <AdminShell
      title={t("adminFlagged")}
      loading={rows === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <Text style={adminStyles.cardSub}>{t("adminFlaggedNote")}</Text>
      {(rows ?? []).map((r) => (
        <View key={r.id} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>
            {r.data?.name || r.data?.flagReason || `user #${r.id}`}
          </Text>
          <Text style={adminStyles.cardSub}>
            {[r.country, r.priority, r.data?.flagReason].filter(Boolean).join(" · ")}
          </Text>
          <View style={[adminStyles.row, { marginTop: 8 }]}>
            <Pressable
              style={adminStyles.btnGhost}
              onPress={() => router.push(`/admin/users/${r.id}`)}
            >
              <Text style={adminStyles.btnGhostText}>{t("adminUsers")}</Text>
            </Pressable>
            <Pressable
              style={adminStyles.btn}
              onPress={() =>
                token &&
                void postAdminUserAction(r.id, "unflag", { token })
                  .then(load)
                  .catch((e) => Alert.alert(t("adminFlagged"), e.message))
              }
            >
              <Text style={adminStyles.btnText}>{t("adminUnflag")}</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {rows?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
