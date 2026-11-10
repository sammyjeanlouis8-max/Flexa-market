/**
 * Admin settings / system tools hub — links to native broadcast, push, fees, security.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback } from "react";
import { Pressable, Text } from "react-native";
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

      {isSuperAdminUser(user) ? (
        <>
          <Pressable style={adminStyles.card} onPress={() => router.push("/admin/broadcast")}>
            <Text style={adminStyles.cardTitle}>{t("adminBroadcast")}</Text>
            <Text style={adminStyles.cardSub}>{t("adminBroadcastHint")}</Text>
          </Pressable>
          <Pressable style={adminStyles.card} onPress={() => router.push("/admin/push-campaigns")}>
            <Text style={adminStyles.cardTitle}>{t("adminPushCampaigns")}</Text>
            <Text style={adminStyles.cardSub}>{t("adminPushHint")}</Text>
          </Pressable>
          <Pressable style={adminStyles.card} onPress={() => router.push("/admin/fees")}>
            <Text style={adminStyles.cardTitle}>{t("adminFeeSettings")}</Text>
            <Text style={adminStyles.cardSub}>{t("adminFeesHint")}</Text>
          </Pressable>
        </>
      ) : null}

      {(user?.isAdmin || isSuperAdminUser(user)) ? (
        <>
          <Pressable style={adminStyles.card} onPress={() => router.push("/admin/tv-cms")}>
            <Text style={adminStyles.cardTitle}>{t("adminTvCms")}</Text>
            <Text style={adminStyles.cardSub}>{t("adminTvCmsHint")}</Text>
          </Pressable>
          <Pressable style={adminStyles.card} onPress={() => router.push("/admin/music-cms")}>
            <Text style={adminStyles.cardTitle}>{t("adminMusicCms")}</Text>
            <Text style={adminStyles.cardSub}>{t("adminMusicCmsHint")}</Text>
          </Pressable>
          <Pressable style={adminStyles.card} onPress={() => router.push("/admin/security")}>
            <Text style={adminStyles.cardTitle}>{t("adminSecurity")}</Text>
            <Text style={adminStyles.cardSub}>{t("adminSecurityHint")}</Text>
          </Pressable>
        </>
      ) : null}
    </AdminShell>
  );
}
