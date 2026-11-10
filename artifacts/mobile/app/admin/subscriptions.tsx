/**
 * VIP / vendor subscriptions admin — Super Admin only.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  fetchAdminSubscriptions,
  grantAdminSubscription,
  revokeAdminSubscription,
} from "@/lib/adminApi";
import { isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminSubscriptionsScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState<any[] | null>(null);
  const [userId, setUserId] = useState("");
  const [plan, setPlan] = useState("pro");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setRows(await fetchAdminSubscriptions({ token }));
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
      if (token && !isSuperAdminUser(user)) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  return (
    <AdminShell
      title={t("adminVipSubs")}
      loading={rows === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <Text style={adminStyles.cardSub}>{t("adminVipSubsNote")}</Text>
      <View style={adminStyles.card}>
        <Text style={adminStyles.cardTitle}>{t("adminGrantSub")}</Text>
        <TextInput
          style={adminStyles.search}
          value={userId}
          onChangeText={setUserId}
          placeholder="userId"
          placeholderTextColor="#94A3B8"
          keyboardType="number-pad"
        />
        <View style={[adminStyles.row, { flexWrap: "wrap", marginTop: 8 }]}>
          {["basic", "pro", "business"].map((p) => (
            <Pressable
              key={p}
              style={[adminStyles.chip, plan === p && adminStyles.chipOn]}
              onPress={() => setPlan(p)}
            >
              <Text style={[adminStyles.chipText, plan === p && adminStyles.chipTextOn]}>{p}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={[adminStyles.btn, { marginTop: 8, alignSelf: "flex-start" }]}
          onPress={() => {
            const id = Number(userId);
            if (!token || !Number.isFinite(id)) return;
            void grantAdminSubscription({ userId: id, plan, months: 1 }, { token })
              .then(() => {
                Alert.alert(t("adminVipSubs"), "Granted");
                setUserId("");
                return load();
              })
              .catch((e) => Alert.alert(t("adminVipSubs"), e.message));
          }}
        >
          <Text style={adminStyles.btnText}>{t("adminGrantSub")}</Text>
        </Pressable>
      </View>
      {(rows ?? []).map((r, i) => {
        const sub = r.sub || r;
        const u = r.user || {};
        return (
          <View key={sub.id ?? i} style={adminStyles.card}>
            <Text style={adminStyles.cardTitle}>
              {u.name || u.email || `user ${sub.userId}`} · {sub.plan}
            </Text>
            <Text style={adminStyles.cardSub}>
              {[sub.status, sub.expiresAt, u.email].filter(Boolean).join(" · ")}
            </Text>
            <Pressable
              style={[adminStyles.btnGhost, { marginTop: 8, alignSelf: "flex-start" }]}
              onPress={() =>
                token &&
                void revokeAdminSubscription({ userId: Number(sub.userId || u.id) }, { token })
                  .then(load)
                  .catch((e) => Alert.alert(t("adminVipSubs"), e.message))
              }
            >
              <Text style={adminStyles.btnGhostText}>{t("adminRevokeSub")}</Text>
            </Pressable>
          </View>
        );
      })}
      {rows?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
