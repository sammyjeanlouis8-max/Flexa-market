import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

interface AdminStats {
  totalUsers?: number;
  totalListings?: number;
  activeListings?: number;
  totalOrders?: number;
  totalRevenue?: number;
  pendingKyc?: number;
  bannedUsers?: number;
  flaggedListings?: number;
}

interface AdminUser {
  id: number;
  name: string;
  email: string;
  country?: string;
  isBanned?: boolean;
  isFlagged?: boolean;
  isVerified?: boolean;
  role?: string;
  listingCount?: number;
  createdAt: string;
}

export default function AdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { request } = useApi();
  const [tab, setTab] = useState<"stats" | "users" | "listings">("stats");
  const [stats, setStats] = useState<AdminStats>({});
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = user?.isAdmin || user?.isSuperAdmin || user?.role === "admin" || user?.role === "superadmin";

  const fetchStats = useCallback(async () => {
    try {
      const data = await request<AdminStats>("/admin/stats");
      setStats(data as AdminStats);
    } catch {}
  }, [request]);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await request<{ users?: AdminUser[] } | AdminUser[]>("/admin/users?limit=30");
      const list = Array.isArray(data) ? data : (data as any).users ?? [];
      setUsers(list);
    } catch {}
  }, [request]);

  const fetchAll = useCallback(async () => {
    await Promise.allSettled([fetchStats(), fetchUsers()]);
  }, [fetchStats, fetchUsers]);

  useEffect(() => { fetchAll().finally(() => setLoading(false)); }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  async function handleBan(userId: number, isBanned: boolean) {
    const action = isBanned ? "unban" : "ban";
    Alert.alert(isBanned ? "Debloke?" : "Bann Itilizatè?", `Ou vle ${action} itilizatè sa a?`, [
      { text: "Non", style: "cancel" },
      { text: isBanned ? "Debloke" : "Bann", style: "destructive", onPress: async () => {
        try {
          await request(`/admin/users/${userId}/${action}`, { method: "POST", body: JSON.stringify({ reason: "Admin action" }) });
          setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isBanned: !isBanned } : u));
        } catch (e: any) { Alert.alert("Erè", e?.message ?? "Erè"); }
      }},
    ]);
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!isAdmin) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="shield-off" size={52} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aksè Refize</Text>
        <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Ou pa admin</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backPill, { backgroundColor: colors.muted }]}>
          <Text style={[{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 14 }]}>Retounen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  const STAT_CARDS = [
    { label: "Itilizatè", value: stats.totalUsers ?? 0, icon: "users" as const, color: "#6366F1" },
    { label: "Annons", value: stats.totalListings ?? 0, icon: "package" as const, color: "#22C55E" },
    { label: "Kòmand", value: stats.totalOrders ?? 0, icon: "shopping-bag" as const, color: "#F59E0B" },
    { label: "Revni", value: `$${Number(stats.totalRevenue ?? 0).toFixed(0)}`, icon: "dollar-sign" as const, color: "#EC4899" },
    { label: "KYC Kap Tann", value: stats.pendingKyc ?? 0, icon: "shield" as const, color: "#EF4444" },
    { label: "Bann", value: stats.bannedUsers ?? 0, icon: "user-x" as const, color: "#94A3B8" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>🛡 Panneau Admin</Text>
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(["stats", "users", "listings"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "stats" ? "Stats" : t === "users" ? `Itilizatè (${users.length})` : "Annons"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "stats" && (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          <View style={styles.statsGrid}>
            {STAT_CARDS.map((card) => (
              <View key={card.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.statIcon, { backgroundColor: card.color + "22" }]}>
                  <Feather name={card.icon} size={20} color={card.color} />
                </View>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{card.value}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{card.label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {tab === "users" && (
        <FlatList
          data={users}
          keyExtractor={(u) => String(u.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <View style={[styles.userRow, { borderBottomColor: colors.border, backgroundColor: item.isBanned ? "#EF444408" : colors.background }]}>
              <View style={[styles.userAvatar, { backgroundColor: item.isBanned ? "#EF444422" : colors.muted }]}>
                <Text style={{ fontSize: 16 }}>{item.name?.charAt(0)?.toUpperCase() ?? "?"}</Text>
              </View>
              <View style={styles.userInfo}>
                <View style={styles.userNameRow}>
                  <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
                  {item.isBanned && <View style={styles.bannedBadge}><Text style={styles.bannedText}>Bann</Text></View>}
                  {item.role && item.role !== "user" && (
                    <View style={[styles.roleBadge, { backgroundColor: "#6366F122" }]}>
                      <Text style={[styles.roleText, { color: "#6366F1" }]}>{item.role}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.userEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{item.email}</Text>
                <Text style={[styles.userMeta, { color: colors.mutedForeground }]}>
                  {item.country ?? "—"} · {new Date(item.createdAt).toLocaleDateString("fr-FR")}
                </Text>
              </View>
              <TouchableOpacity style={[styles.banBtn, { backgroundColor: item.isBanned ? "#22C55E22" : "#EF444422" }]} onPress={() => handleBan(item.id, !!item.isBanned)}>
                <Feather name={item.isBanned ? "user-check" : "user-x"} size={16} color={item.isBanned ? "#22C55E" : "#EF4444"} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {tab === "listings" && (
        <View style={[styles.center, { flex: 1 }]}>
          <Feather name="list" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Jere annons yo sou sit wèb la</Text>
          <TouchableOpacity style={[styles.webBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="external-link" size={16} color={colors.primary} />
            <Text style={[styles.webBtnText, { color: colors.primary }]}>flexamarket.com/admin</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold" },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
  statCard: { width: "47%", borderRadius: 14, borderWidth: 1, padding: 16, gap: 8, alignItems: "flex-start" },
  statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  userRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12, borderBottomWidth: 1 },
  userAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  userInfo: { flex: 1, gap: 2 },
  userNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  userName: { fontSize: 14, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  bannedBadge: { backgroundColor: "#EF444422", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 },
  bannedText: { color: "#EF4444", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  roleBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 },
  roleText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  userEmail: { fontSize: 12, fontFamily: "Inter_400Regular" },
  userMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  banBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  backPill: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  webBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginTop: 8 },
  webBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
