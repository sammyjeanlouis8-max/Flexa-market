/**
 * Platform fee settings — Super Admin read + keyed update via existing API.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAdminPlatformFees, updateAdminPlatformFee } from "@/lib/adminApi";
import { isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminFeesScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [fees, setFees] = useState<Record<string, number> | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchAdminPlatformFees({ token });
      setFees(data);
      setDrafts(
        Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      );
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
      if (token && !isSuperAdminUser(user)) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  return (
    <AdminShell
      title={t("adminFeeSettings")}
      loading={!fees && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <Text style={adminStyles.cardSub}>{t("adminFeesNote")}</Text>
      {fees
        ? Object.keys(fees).map((key) => (
            <View key={key} style={adminStyles.card}>
              <Text style={adminStyles.cardTitle}>{key}</Text>
              <TextInput
                style={adminStyles.search}
                value={drafts[key] ?? ""}
                onChangeText={(v) => setDrafts((d) => ({ ...d, [key]: v }))}
                keyboardType="decimal-pad"
                placeholderTextColor="#94A3B8"
              />
              <Pressable
                style={[adminStyles.btn, { marginTop: 8, alignSelf: "flex-start" }]}
                onPress={() => {
                  const value = Number(drafts[key]);
                  if (!token || !Number.isFinite(value)) return;
                  void updateAdminPlatformFee({ key, value }, { token })
                    .then(() => {
                      Alert.alert(t("adminFeeSettings"), `${key} → ${value}`);
                      return load();
                    })
                    .catch((e) => Alert.alert(t("adminFeeSettings"), e.message));
                }}
              >
                <Text style={adminStyles.btnText}>{t("save")}</Text>
              </Pressable>
            </View>
          ))
        : null}
    </AdminShell>
  );
}
