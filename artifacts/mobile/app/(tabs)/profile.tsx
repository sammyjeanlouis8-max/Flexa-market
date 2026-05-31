import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, refreshUser } = useAuth();
  const { request } = useApi();
  const { t } = useLanguage();
  const [listingCount, setListingCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [countData, notifData] = await Promise.allSettled([
        request<{ count: number }>(`/listings/my-count`),
        request<{ count: number }>(`/notifications/unread-count`),
      ]);
      if (countData.status === "fulfilled") setListingCount((countData.value as any).count ?? 0);
      if (notifData.status === "fulfilled") setUnreadNotifs((notifData.value as any).count ?? 0);
    } catch {}
  }, [request, user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshUser(), fetchData()]);
    setRefreshing(false);
  }, [refreshUser, fetchData]);

  function handleLogout() {
    Alert.alert(t("logoutTitle"), t("logoutMsg"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("logout"), style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await logout();
          router.replace("/auth/login");
        },
      },
    ]);
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const initials = user?.name?.slice(0, 2).toUpperCase() ?? "?";
  const isAdmin = user?.isAdmin || user?.isSuperAdmin || user?.role === "admin" || user?.role === "superadmin";

  type FeatherIconName = React.ComponentProps<typeof Feather>["name"];

  const menuSections: Array<{
    label: string;
    items: Array<{ icon: FeatherIconName; label: string; onPress: () => void; badge?: number; color?: string }>;
  }> = [
    {
      label: "Kont Mwen",
      items: [
        { icon: "package", label: "Mes Annonces", onPress: () => router.push("/my-listings") },
        { icon: "heart", label: "Sauvegardés", onPress: () => router.push("/favorites") },
        { icon: "tag", label: "Ofè", onPress: () => router.push("/offers") },
        { icon: "shopping-bag", label: t("myOrders"), onPress: () => router.push("/orders") },
        { icon: "trending-up", label: "Ventes", onPress: () => router.push("/sales") },
      ],
    },
    {
      label: "Vendè",
      items: [
        { icon: "zap", label: "⚡ Mes Boosts Actifs", onPress: () => router.push("/my-boosts") },
        { icon: "video", label: "🎬 Vidéos Promo", onPress: () => router.push("/videos") },
      ],
    },
    {
      label: "Finans",
      items: [
        { icon: "credit-card", label: t("myWallet"), onPress: () => router.push("/wallet") },
        { icon: "dollar-sign", label: "🏛 Demande de Prêt", onPress: () => router.push("/loans"), color: "#6366F1" },
      ],
    },
    {
      label: "Kont & Preferans",
      items: [
        { icon: "bell", label: "Notifikasyon", onPress: () => router.push("/notifications"), badge: unreadNotifs },
        { icon: "shield", label: t("myKyc"), onPress: () => router.push("/kyc") },
        { icon: "globe", label: t("sLanguage"), onPress: () => router.push("/language-picker") },
        { icon: "settings", label: t("mySettings"), onPress: () => router.push("/settings") },
      ],
    },
    {
      label: "🌐 Site Wèb Konplè",
      items: [
        { icon: "monitor" as FeatherIconName, label: "Ouvri tout fonksyon sit wèb la", onPress: () => router.push("/website"), color: "#F97316" },
      ],
    },
    ...(isAdmin ? [{
      label: "Administration",
      items: [
        { icon: "shield" as FeatherIconName, label: "🛡 Panneau Admin", onPress: () => router.push("/admin"), color: "#6366F1" },
      ],
    }] : []),
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.avatarSection}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={[styles.avatar, { borderColor: colors.border }]} contentFit="cover" />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: colors.primary, borderColor: colors.border }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
          <View style={styles.userInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: colors.foreground }]}>{user?.name ?? "—"}</Text>
              {isAdmin && (
                <View style={[styles.adminBadge, { backgroundColor: "#6366F122" }]}>
                  <Text style={[styles.adminText, { color: "#6366F1" }]}>Admin</Text>
                </View>
              )}
            </View>
            <Text style={[styles.email, { color: colors.mutedForeground }]}>{user?.email ?? ""}</Text>
            {user?.country && (
              <View style={[styles.countryBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                <Text style={[styles.countryText, { color: colors.mutedForeground }]}>{user.country}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
          <TouchableOpacity style={styles.stat} onPress={() => router.push("/my-listings")}>
            <Text style={[styles.statNum, { color: colors.foreground }]}>{listingCount}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("listingsCount")}</Text>
          </TouchableOpacity>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Feather name={user?.isPhoneVerified ? "check-circle" : "alert-circle"} size={20} color={user?.isPhoneVerified ? "#22C55E" : colors.mutedForeground} />
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              {user?.isPhoneVerified ? t("verified") : t("notVerified")}
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Feather name="star" size={20} color="#F59E0B" />
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("rating")}</Text>
          </View>
        </View>
      </View>

      {menuSections.map((section) => (
        <View key={section.label} style={styles.sectionWrap}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{section.label.toUpperCase()}</Text>
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {section.items.map((item, idx, arr) => (
              <TouchableOpacity
                key={item.label}
                style={[styles.menuItem, { borderBottomColor: colors.border, borderBottomWidth: idx < arr.length - 1 ? 1 : 0 }]}
                onPress={item.onPress}
              >
                <View style={[styles.menuIcon, { backgroundColor: item.color ? item.color + "22" : colors.muted }]}>
                  <Feather name={item.icon} size={18} color={item.color ?? colors.primary} />
                </View>
                <Text style={[styles.menuLabel, { color: item.color ?? colors.foreground }]}>{item.label}</Text>
                {(item.badge ?? 0) > 0 && (
                  <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                )}
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      <Pressable
        style={({ pressed }) => [styles.logoutBtn, { borderColor: colors.destructive, opacity: pressed ? 0.7 : 1 }]}
        onPress={handleLogout}
        testID="logout-btn"
      >
        <Feather name="log-out" size={18} color={colors.destructive} />
        <Text style={[styles.logoutText, { color: colors.destructive }]}>{t("logout")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 0, borderBottomWidth: 1 },
  avatarSection: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 20 },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 2 },
  avatarFallback: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  avatarText: { color: "#FFF", fontSize: 24, fontFamily: "Inter_700Bold" },
  userInfo: { flex: 1, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 18, fontFamily: "Inter_700Bold" },
  adminBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  adminText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  email: { fontSize: 13, fontFamily: "Inter_400Regular" },
  countryBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, marginTop: 2 },
  countryText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  statsRow: { flexDirection: "row", borderTopWidth: 1, paddingVertical: 16, marginTop: 4 },
  stat: { flex: 1, alignItems: "center", gap: 4 },
  statNum: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statDivider: { width: 1, marginVertical: 4 },
  sectionWrap: { marginHorizontal: 16, marginTop: 16 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 6, marginLeft: 4, letterSpacing: 0.8 },
  section: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  menuItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  menuIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  menuLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  badgeText: { color: "#FFF", fontSize: 11, fontFamily: "Inter_700Bold" },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, margin: 16, marginTop: 24, height: 50, borderRadius: 14, borderWidth: 1.5 },
  logoutText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
