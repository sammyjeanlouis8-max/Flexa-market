/**
 * Admin KYC review queue — approve/reject via existing /admin/kyc APIs.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { decideKyc, fetchAdminKyc } from "@/lib/adminApi";
import { canModerate, isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminKycScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setRows(await fetchAdminKyc({ token }));
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

  const decide = (userId: number, decision: "approved" | "rejected") => {
    if (!token) return;
    Alert.alert(t("adminKyc"), `${decision} #${userId}?`, [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("ok"),
        onPress: () =>
          void decideKyc(userId, decision, { token })
            .then(load)
            .catch((e) => Alert.alert(t("adminKyc"), e instanceof Error ? e.message : "Error")),
      },
    ]);
  };

  return (
    <AdminShell
      title={t("adminKyc")}
      loading={rows === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <Text style={adminStyles.cardSub}>{t("adminKycNote")}</Text>
      {(rows ?? []).map((r) => {
        const uid = Number(r.userId || r.id);
        return (
          <View key={uid} style={adminStyles.card}>
            <Text style={adminStyles.cardTitle}>{r.name || r.userName || r.email || `#${uid}`}</Text>
            <Text style={adminStyles.cardSub}>
              {r.email || ""} · {r.status || r.kycStatus || "pending"} · {r.documentType || ""}
            </Text>
            <View style={[adminStyles.row, { marginTop: 8 }]}>
              <Pressable style={adminStyles.btn} onPress={() => decide(uid, "approved")}>
                <Text style={adminStyles.btnText}>{t("adminApprove")}</Text>
              </Pressable>
              <Pressable style={adminStyles.btnGhost} onPress={() => decide(uid, "rejected")}>
                <Text style={adminStyles.btnGhostText}>{t("adminReject")}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      {rows?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
