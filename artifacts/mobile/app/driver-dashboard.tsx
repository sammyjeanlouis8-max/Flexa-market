import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

interface DriverStats {
  fullName: string;
  city: string;
  vehicleType: string;
  status: "active" | "suspended" | "pending";
  rating: number;
  totalEarnings: number;
  deliveriesCompleted: number;
  platformFees: number;
  netEarnings: number;
  averageRating: number;
  badges?: string[];
}
interface Delivery {
  id: number;
  status: string;
  buyerName?: string;
  pickupCity?: string;
  deliveryCity?: string;
  amount: number;
  createdAt: string;
  tip?: number;
}

const STATUS_COLORS: Record<string, string> = {
  delivered: "#22C55E", waiting: "#F59E0B", cancelled: "#EF4444",
  on_the_way: "#3B82F6", picked_up: "#8B5CF6", driver_assigned: "#0EA5E9",
};
const BADGE_ICONS: Record<string, string> = {
  "Top Driver": "⭐", "Reliable Driver": "🏅", "Fast Delivery": "⚡", "Customer Favorite": "❤️",
};

export default function DriverDashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [stats, setStats] = useState<DriverStats | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"overview" | "history">("overview");

  const fetchAll = useCallback(async () => {
    try {
      const [statsData, histData] = await Promise.all([
        request<DriverStats>("/delivery/driver/stats"),
        request<Delivery[] | { deliveries: Delivery[] }>("/driver/delivery-history"),
      ]);
      setStats(statsData as DriverStats);
      const raw = histData as any;
      setDeliveries(Array.isArray(raw) ? raw : (raw?.deliveries ?? []));
    } catch { }
  }, [request]);

  useEffect(() => { setLoading(true); fetchAll().finally(() => setLoading(false)); }, [fetchAll]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchAll(); setRefreshing(false); }, [fetchAll]);

  const vehicleEmoji = stats?.vehicleType === "motorcycle" ? "🏍️" : stats?.vehicleType === "car" ? "🚗" : stats?.vehicleType === "truck" ? "🚛" : "🚲";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 10, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Dashboard Chofè</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.headerBtn}>
          <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : !stats ? (
        <View style={styles.centered}>
          <Feather name="truck" size={52} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Ou pa chofè FM</Text>
          <Pressable style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/driver-apply")}>
            <Text style={styles.primaryBtnText}>Aplike kounye a</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {/* Identity Card */}
          <View style={[styles.idCard, { backgroundColor: "#0F172A" }]}>
            <View style={styles.idTop}>
              <View>
                <Text style={styles.idName}>{vehicleEmoji} {stats.fullName}</Text>
                <Text style={styles.idCity}>{stats.city} · {stats.vehicleType}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: stats.status === "active" ? "#22C55E22" : "#EF444422" }]}>
                <View style={[styles.statusDot, { backgroundColor: stats.status === "active" ? "#22C55E" : "#EF4444" }]} />
                <Text style={[styles.statusText, { color: stats.status === "active" ? "#22C55E" : "#EF4444" }]}>
                  {stats.status === "active" ? "Aktif" : stats.status === "suspended" ? "Suspann" : "Annatant"}
                </Text>
              </View>
            </View>
            <View style={styles.idStats}>
              <View style={styles.idStat}>
                <Text style={styles.idStatNum}>{stats.deliveriesCompleted}</Text>
                <Text style={styles.idStatLabel}>Livrezon</Text>
              </View>
              <View style={[styles.idDivider]} />
              <View style={styles.idStat}>
                <Text style={styles.idStatNum}>⭐ {stats.averageRating?.toFixed(1) ?? "—"}</Text>
                <Text style={styles.idStatLabel}>Nòt</Text>
              </View>
              <View style={styles.idDivider} />
              <View style={styles.idStat}>
                <Text style={styles.idStatNum}>${stats.netEarnings?.toFixed(2) ?? "0.00"}</Text>
                <Text style={styles.idStatLabel}>Rèvni (80%)</Text>
              </View>
            </View>
          </View>

          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            {[
              { label: "Livrezon", val: String(stats.deliveriesCompleted), icon: "package", color: "#3B82F6" },
              { label: "Rèvni Net (80%)", val: `$${stats.netEarnings?.toFixed(2) ?? "0.00"}`, icon: "dollar-sign", color: "#22C55E" },
              { label: "Frè Platfòm (20%)", val: `$${stats.platformFees?.toFixed(2) ?? "0.00"}`, icon: "percent", color: "#F59E0B" },
              { label: "Nòt Mwayen", val: `⭐ ${stats.averageRating?.toFixed(1) ?? "—"}`, icon: "star", color: "#8B5CF6" },
            ].map((s) => (
              <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.statIcon, { backgroundColor: s.color + "22" }]}>
                  <Feather name={s.icon as any} size={16} color={s.color} />
                </View>
                <Text style={[styles.statVal, { color: colors.foreground }]}>{s.val}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Badges */}
          {(stats.badges?.length ?? 0) > 0 && (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Distinksyon</Text>
              <View style={styles.badgesRow}>
                {stats.badges!.map((b) => (
                  <View key={b} style={[styles.badge, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={styles.badgeEmoji}>{BADGE_ICONS[b] ?? "🏆"}</Text>
                    <Text style={[styles.badgeLabel, { color: colors.foreground }]}>{b}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Delivery History */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Dènye Livrezon yo</Text>
            {deliveries.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Pa gen livrezon ankò.</Text>
            ) : (
              deliveries.slice(0, 15).map((d) => {
                const statusColor = STATUS_COLORS[d.status] ?? colors.mutedForeground;
                return (
                  <View key={d.id} style={[styles.deliveryRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.deliveryStatus, { backgroundColor: statusColor + "22" }]}>
                      <Feather name="package" size={14} color={statusColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.deliveryRoute, { color: colors.foreground }]}>
                        {d.pickupCity ?? "—"} → {d.deliveryCity ?? "—"}
                      </Text>
                      <Text style={[styles.deliveryDate, { color: colors.mutedForeground }]}>
                        {new Date(d.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.deliveryAmount, { color: "#22C55E" }]}>${d.amount?.toFixed(2) ?? "—"}</Text>
                      {(d.tip ?? 0) > 0 && <Text style={[styles.deliveryTip, { color: "#F59E0B" }]}>+${d.tip?.toFixed(2)} tip</Text>}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  primaryBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  idCard: { margin: 16, borderRadius: 20, padding: 20 },
  idTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  idName: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  idCity: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  idStats: { flexDirection: "row", alignItems: "center" },
  idStat: { flex: 1, alignItems: "center", gap: 3 },
  idStatNum: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  idStatLabel: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontFamily: "Inter_400Regular" },
  idDivider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.1)" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", padding: 16, gap: 10 },
  statCard: { width: "47%", borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  section: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  badgeEmoji: { fontSize: 14 },
  badgeLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  deliveryRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  deliveryStatus: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  deliveryRoute: { fontSize: 13, fontFamily: "Inter_500Medium" },
  deliveryDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  deliveryAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  deliveryTip: { fontSize: 11, fontFamily: "Inter_500Medium" },
});
