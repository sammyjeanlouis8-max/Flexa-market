import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useApi, Listing } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { ListingCard } from "@/components/ListingCard";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, refreshUser } = useAuth();
  const { request } = useApi();
  const { t } = useLanguage();

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMyListings = useCallback(async () => {
    if (!user) return;
    try {
      const data = await request<{ listings: Listing[] } | Listing[]>(`/users/${user.id}/listings`);
      const items = Array.isArray(data) ? data : (data as { listings: Listing[] }).listings ?? [];
      setListings(items);
    } catch {
      setListings([]);
    }
  }, [request, user]);

  useEffect(() => {
    fetchMyListings().finally(() => setLoading(false));
  }, [fetchMyListings]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshUser(), fetchMyListings()]);
    setRefreshing(false);
  }, [refreshUser, fetchMyListings]);

  function handleLogout() {
    Alert.alert(t("logoutTitle"), t("logoutMsg"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("logout"),
        style: "destructive",
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
            <Text style={[styles.name, { color: colors.foreground }]}>{user?.name ?? "—"}</Text>
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
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.foreground }]}>{listings.length}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("listingsCount")}</Text>
          </View>
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

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {[
          { icon: "shopping-bag" as const, label: t("myFavorites"), onPress: () => {} },
          { icon: "truck" as const, label: t("myOrders"), onPress: () => router.push("/orders") },
          { icon: "credit-card" as const, label: t("myWallet"), onPress: () => router.push("/wallet") },
          { icon: "shield" as const, label: t("myKyc"), onPress: () => router.push("/kyc") },
          { icon: "star" as const, label: t("myReviews"), onPress: () => {} },
          { icon: "globe" as const, label: t("sLanguage"), onPress: () => router.push("/language-picker") },
          { icon: "settings" as const, label: t("mySettings"), onPress: () => router.push("/settings") },
        ].map((item, idx, arr) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.menuItem, { borderBottomColor: colors.border, borderBottomWidth: idx < arr.length - 1 ? 1 : 0 }]}
            onPress={item.onPress}
          >
            <View style={[styles.menuIcon, { backgroundColor: colors.muted }]}>
              <Feather name={item.icon} size={18} color={colors.primary} />
            </View>
            <Text style={[styles.menuLabel, { color: colors.foreground }]}>{item.label}</Text>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </View>

      {listings.length > 0 && (
        <View style={styles.listingsSection}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("myListings")} ({listings.length})</Text>
          <View style={styles.grid}>
            {listings.slice(0, 4).map((item) => (
              <ListingCard key={item.id} item={item} />
            ))}
          </View>
          {listings.length > 4 && (
            <Pressable style={[styles.seeAllBtn, { borderColor: colors.border }]}>
              <Text style={[styles.seeAllText, { color: colors.primary }]}>{t("seeAll")} ({listings.length})</Text>
            </Pressable>
          )}
        </View>
      )}

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
  name: { fontSize: 18, fontFamily: "Inter_700Bold" },
  email: { fontSize: 13, fontFamily: "Inter_400Regular" },
  countryBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, marginTop: 2 },
  countryText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  statsRow: { flexDirection: "row", borderTopWidth: 1, paddingVertical: 16, marginTop: 4 },
  stat: { flex: 1, alignItems: "center", gap: 4 },
  statNum: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statDivider: { width: 1, marginVertical: 4 },
  section: { marginHorizontal: 16, marginTop: 16, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  menuItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  menuIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  menuLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  listingsSection: { paddingHorizontal: 16, marginTop: 24 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
  seeAllBtn: { marginTop: 12, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  seeAllText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, margin: 16, marginTop: 24, height: 50, borderRadius: 14, borderWidth: 1.5 },
  logoutText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
