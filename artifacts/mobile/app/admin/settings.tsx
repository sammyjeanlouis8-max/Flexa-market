/**
 * Admin settings / system tools hub.
 * Broadcast SMS/email and push campaign composers remain on web (documented gaps).
 * Preserves existing Firebase/Expo push routes — does not alter package IDs.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { canAccessAdminCenter, isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminSettingsScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();

  useFocusEffect(
    useCallback(() => {
      if (!isLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && !canAccessAdminCenter(user)) {
        router.replace("/(tabs)/profile");
      }
    }, [isLoading, token, user, router]),
  );

  return (
    <AdminShell title={t("adminSettings")}>
      <Text style={adminStyles.cardSub}>{t("adminSettingsNote")}</Text>

      <Pressable style={adminStyles.card} onPress={() => router.push("/notifications")}>
        <Text style={adminStyles.cardTitle}>{t("adminNotifPrefs")}</Text>
        <Text style={adminStyles.cardSub}>{t("adminNotifPrefsHint")}</Text>
      </Pressable>

      <Pressable style={adminStyles.card} onPress={() => router.push("/settings")}>
        <Text style={adminStyles.cardTitle}>{t("mySettings")}</Text>
        <Text style={adminStyles.cardSub}>{t("adminAppSettingsHint")}</Text>
      </Pressable>

      <View style={adminStyles.card}>
        <Text style={adminStyles.cardTitle}>{t("adminBroadcast")}</Text>
        <Text style={adminStyles.cardSub}>{t("adminBroadcastMissing")}</Text>
      </View>

      <View style={adminStyles.card}>
        <Text style={adminStyles.cardTitle}>{t("adminPushCampaigns")}</Text>
        <Text style={adminStyles.cardSub}>{t("adminPushCampaignsMissing")}</Text>
      </View>

      {isSuperAdminUser(user) ? (
        <View style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{t("adminFeeSettings")}</Text>
          <Text style={adminStyles.cardSub}>{t("adminFeeSettingsMissing")}</Text>
        </View>
      ) : null}
    </AdminShell>
  );
}
