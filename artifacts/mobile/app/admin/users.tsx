/**
 * Native admin user directory — search, verify/ban/restrict via existing APIs.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAdminUsers, postAdminUserAction } from "@/lib/adminApi";
import { canAccessAdminCenter, canManageUsersHard, canModerate } from "@/lib/adminRoles";

export default function AdminUsersScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchAdminUsers({ token, q: q.trim() || undefined });
      setRows(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
      setRows((p) => p ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [token, q, t]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && !canAccessAdminCenter(user)) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  const act = (id: number, action: Parameters<typeof postAdminUserAction>[1]) => {
    if (!token) return;
    if ((action === "ban" || action === "unban") && !canManageUsersHard(user)) {
      Alert.alert(t("adminUsers"), t("adminForbidden"));
      return;
    }
    if (!canModerate(user) && !canManageUsersHard(user)) {
      Alert.alert(t("adminUsers"), t("adminForbidden"));
      return;
    }
    Alert.alert(t("adminUsers"), `${action} #${id}?`, [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("ok"),
        onPress: () =>
          void postAdminUserAction(id, action, { token })
            .then(() => load())
            .catch((e) => Alert.alert(t("adminUsers"), e instanceof Error ? e.message : "Error")),
      },
    ]);
  };

  return (
    <AdminShell
      title={t("adminUsers")}
      loading={rows === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <TextInput
        style={adminStyles.search}
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => void load()}
        placeholder={t("adminSearchUsers")}
        placeholderTextColor="#94A3B8"
        returnKeyType="search"
      />
      {(rows ?? []).map((u) => (
        <Pressable
          key={u.id}
          style={adminStyles.card}
          onPress={() => router.push(`/admin/users/${u.id}`)}
        >
          <Text style={adminStyles.cardTitle}>{u.name || u.email}</Text>
          <Text style={adminStyles.cardSub}>
            {u.email} · {u.country || "—"} · {(u.role || "user").toString()}
          </Text>
          <Text style={adminStyles.cardSub}>
            {[
              u.isBanned ? "banned" : null,
              u.isRestricted ? "restricted" : null,
              u.isFlagged ? "flagged" : null,
              u.isPhoneVerified || u.isVerified ? "verified" : null,
            ]
              .filter(Boolean)
              .join(" · ") || "active"}
          </Text>
          <View style={[adminStyles.row, { marginTop: 8, flexWrap: "wrap" }]}>
            <Pressable style={adminStyles.btnGhost} onPress={() => act(u.id, "verify")}>
              <Text style={adminStyles.btnGhostText}>{t("adminVerify")}</Text>
            </Pressable>
            <Pressable style={adminStyles.btnGhost} onPress={() => act(u.id, "restrict")}>
              <Text style={adminStyles.btnGhostText}>{t("adminRestrict")}</Text>
            </Pressable>
            <Pressable style={[adminStyles.btn, adminStyles.danger]} onPress={() => act(u.id, "ban")}>
              <Text style={adminStyles.btnText}>{t("adminBan")}</Text>
            </Pressable>
          </View>
        </Pressable>
      ))}
      {rows?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
