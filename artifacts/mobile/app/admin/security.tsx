/**
 * Password-hash security tools — stats + superadmin invalidate/nudge actions.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { isSuperAdminUser } from "@/lib/adminRoles";
import {
  fetchPasswordHashStats,
  postInvalidateSha256Passwords,
  postNotifyLegacyPasswordUsers,
} from "@/lib/phase3mApis";

export default function AdminSecurityScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [stats, setStats] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setStats(await fetchPasswordHashStats({ token }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
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
      if (token && !(user?.isAdmin || isSuperAdminUser(user))) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  return (
    <AdminShell
      title={t("adminSecurity")}
      loading={!stats && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <Text style={adminStyles.cardSub}>{t("adminSecurityNote")}</Text>
      {stats ? (
        <View style={adminStyles.metricGrid}>
          <View style={adminStyles.metric}>
            <Text style={adminStyles.metricVal}>{stats.sha256 ?? "—"}</Text>
            <Text style={adminStyles.metricLabel}>SHA-256</Text>
          </View>
          <View style={adminStyles.metric}>
            <Text style={adminStyles.metricVal}>{stats.bcrypt ?? "—"}</Text>
            <Text style={adminStyles.metricLabel}>bcrypt</Text>
          </View>
          <View style={adminStyles.metric}>
            <Text style={adminStyles.metricVal}>{stats.phoneOnly ?? "—"}</Text>
            <Text style={adminStyles.metricLabel}>phone-only</Text>
          </View>
          <View style={adminStyles.metric}>
            <Text style={adminStyles.metricVal}>{stats.eligibleForNudge ?? "—"}</Text>
            <Text style={adminStyles.metricLabel}>nudge-eligible</Text>
          </View>
          <View style={adminStyles.metric}>
            <Text style={adminStyles.metricVal}>{stats.sha256NoPhone ?? "—"}</Text>
            <Text style={adminStyles.metricLabel}>SHA-256 no phone</Text>
          </View>
          <View style={adminStyles.metric}>
            <Text style={adminStyles.metricVal}>{stats.total ?? "—"}</Text>
            <Text style={adminStyles.metricLabel}>total</Text>
          </View>
        </View>
      ) : null}

      <View style={adminStyles.card}>
        <Text style={adminStyles.cardSub}>
          lastNudge={stats?.lastNudgeSentAt ?? "—"} · cooldownEnds=
          {stats?.nudgeCooldownEndsAt ?? "—"} · hours={stats?.nudgeCooldownHours ?? "—"}
        </Text>
      </View>

      {isSuperAdminUser(user) ? (
        <>
          <Pressable
            style={adminStyles.btn}
            onPress={() =>
              token &&
              Alert.alert(t("adminSecurity"), t("adminSecurityNudgeConfirm"), [
                { text: t("cancel"), style: "cancel" },
                {
                  text: t("ok"),
                  onPress: () =>
                    void postNotifyLegacyPasswordUsers({ token })
                      .then((r) => Alert.alert(t("adminSecurity"), JSON.stringify(r).slice(0, 280)))
                      .catch((e) => Alert.alert(t("adminSecurity"), e.message)),
                },
              ])
            }
          >
            <Text style={adminStyles.btnText}>{t("adminSecurityNudge")}</Text>
          </Pressable>
          <Pressable
            style={[adminStyles.btn, adminStyles.danger, { marginTop: 8 }]}
            onPress={() =>
              token &&
              Alert.alert(t("adminSecurity"), t("adminSecurityInvalidateConfirm"), [
                { text: t("cancel"), style: "cancel" },
                {
                  text: t("ok"),
                  style: "destructive",
                  onPress: () =>
                    void postInvalidateSha256Passwords({ token })
                      .then((r) => Alert.alert(t("adminSecurity"), r.message || JSON.stringify(r)))
                      .catch((e) => Alert.alert(t("adminSecurity"), e.message)),
                },
              ])
            }
          >
            <Text style={adminStyles.btnText}>{t("adminSecurityInvalidate")}</Text>
          </Pressable>
        </>
      ) : (
        <Text style={adminStyles.cardSub}>{t("adminSecuritySuperOnly")}</Text>
      )}
    </AdminShell>
  );
}
