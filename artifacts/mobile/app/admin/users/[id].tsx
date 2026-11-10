/**
 * Admin user detail — activity snapshot + privileged actions.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  fetchAdminUserActivity,
  postAdminUserAction,
  setAdminUserRole,
} from "@/lib/adminApi";
import { canManageUsersHard, isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminUserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = Number(id);
  const router = useRouter();
  const { token, user } = useAuth();
  const { t } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(userId)) return;
    try {
      const activity = await fetchAdminUserActivity(userId, { token });
      setData(activity);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
    }
  }, [token, userId, t]);

  useEffect(() => {
    if (!token) {
      router.replace("/auth/login");
      return;
    }
    void load();
  }, [token, router, load]);

  const target = data?.user || data;
  const listings = data?.listings || [];
  const purchases = data?.purchases || [];

  return (
    <AdminShell title={target?.name || t("adminUsers")} loading={!data && !error} error={error}>
      {target ? (
        <View style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{target.name}</Text>
          <Text style={adminStyles.cardSub}>{target.email}</Text>
          <Text style={adminStyles.cardSub}>
            {target.country || "—"} · {target.role || "user"} · id {target.id || userId}
          </Text>
        </View>
      ) : null}

      <View style={[adminStyles.row, { flexWrap: "wrap" }]}>
        {canManageUsersHard(user) ? (
          <>
            <Pressable
              style={adminStyles.btn}
              onPress={() =>
                token &&
                void postAdminUserAction(userId, "unban", { token }).then(load).catch((e) =>
                  Alert.alert(t("adminUsers"), e.message),
                )
              }
            >
              <Text style={adminStyles.btnText}>{t("adminUnban")}</Text>
            </Pressable>
            <Pressable
              style={adminStyles.btnGhost}
              onPress={() =>
                token &&
                void postAdminUserAction(userId, "unrestrict", { token }).then(load).catch((e) =>
                  Alert.alert(t("adminUsers"), e.message),
                )
              }
            >
              <Text style={adminStyles.btnGhostText}>{t("adminUnrestrict")}</Text>
            </Pressable>
          </>
        ) : null}
        {isSuperAdminUser(user) ? (
          <Pressable
            style={adminStyles.btnGhost}
            onPress={() => {
              Alert.alert(t("adminTeam"), t("adminSetRoleHint"), [
                { text: "support", onPress: () => token && void setAdminUserRole(userId, "support", { token }).then(load) },
                { text: "moderator", onPress: () => token && void setAdminUserRole(userId, "moderator", { token }).then(load) },
                { text: "admin", onPress: () => token && void setAdminUserRole(userId, "admin", { token }).then(load) },
                { text: t("cancel"), style: "cancel" },
              ]);
            }}
          >
            <Text style={adminStyles.btnGhostText}>{t("adminSetRole")}</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={adminStyles.section}>{t("adminUserListings")}</Text>
      {listings.slice(0, 10).map((l: any) => (
        <View key={l.id} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{l.title}</Text>
          <Text style={adminStyles.cardSub}>{l.status} · #{l.id}</Text>
        </View>
      ))}
      {!listings.length ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}

      <Text style={adminStyles.section}>{t("adminUserPurchases")}</Text>
      {purchases.slice(0, 10).map((p: any) => (
        <View key={p.id} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>#{p.id}</Text>
          <Text style={adminStyles.cardSub}>
            {p.amount} {p.currency || ""} · {p.paymentStatus || p.status}
          </Text>
        </View>
      ))}
    </AdminShell>
  );
}
