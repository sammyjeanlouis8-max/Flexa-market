import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Platform, Pressable,
  RefreshControl, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

interface Boost {
  id: number;
  listingId: number;
  status: string;
  type?: string;
  expiresAt?: string;
  createdAt: string;
  listing?: { id: number; title: string; price: number; images?: string[] };
  impressions?: number;
  clicks?: number;
}

function daysLeft(iso?: string): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Ekspire";
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff % 86400000) / 3600000);
  return days > 0 ? `${days}j ${hrs}h` : `${hrs}h`;
}

export default function MyBoostsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const [boosts, setBoosts] = useState<Boost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBoosts = useCallback(async () => {
    try {
      const data = await request<{ boosts?: Boost[] } | Boost[]>("/boost/my-active");
      const list = Array.isArray(data) ? data : (data as any).boosts ?? [];
      setBoosts(list);
    } catch { setBoosts([]); }
  }, [request]);

  useEffect(() => { fetchBoosts().finally(() => setLoading(false)); }, [fetchBoosts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBoosts();
    setRefreshing(false);
  }, [fetchBoosts]);

  async function handleCancel(id: number) {
    Alert.alert("Anile Boost?", "Ou vle anile boost sa a?", [
      { text: "Non", style: "cancel" },
      { text: "Anile", style: "destructive", onPress: async () => {
        try {
          await request(`/boost/${id}/cancel`, { method: "POST" });
          setBoosts((prev) => prev.filter((b) => b.id !== id));
        } catch (e: any) { Alert.alert("Erè", e?.message ?? "Erè"); }
      }},
    ]);
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (loading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>⚡ Mes Boosts Actifs</Text>
      </View>

      {boosts.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 48 }}>⚡</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Okenn boost aktif</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Boost annons ou pou gen plis vizibilite</Text>
          <Pressable style={[styles.actionBigBtn, { backgroundColor: colors.accent }]} onPress={() => router.push("/my-listings")}>
            <Text style={styles.actionBigBtnText}>Boost yon Annons</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={boosts}
          keyExtractor={(b) => String(b.id)}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const img = item.listing?.images?.[0];
            const left = daysLeft(item.expiresAt);
            const expired = left === "Ekspire";
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: expired ? colors.destructive + "55" : colors.border }]}>
                <View style={styles.cardTop}>
                  {img ? (
                    <Image source={{ uri: img }} style={styles.cardImg} contentFit="cover" />
                  ) : (
                    <View style={[styles.cardImg, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
                      <Text style={{ fontSize: 24 }}>⚡</Text>
                    </View>
                  )}
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                      {item.listing?.title ?? `Boost #${item.id}`}
                    </Text>
                    <View style={[styles.badge, { backgroundColor: expired ? "#EF444422" : "#22C55E22" }]}>
                      <Text style={[styles.badgeText, { color: expired ? "#EF4444" : "#22C55E" }]}>
                        {expired ? "⚠ Ekspire" : `⚡ ${item.status}`}
                      </Text>
                    </View>
                    <View style={styles.statsRow}>
                      <View style={styles.stat}>
                        <Feather name="eye" size={12} color={colors.mutedForeground} />
                        <Text style={[styles.statText, { color: colors.mutedForeground }]}>{item.impressions ?? 0} vye</Text>
                      </View>
                      <View style={styles.stat}>
                        <Feather name="mouse-pointer" size={12} color={colors.mutedForeground} />
                        <Text style={[styles.statText, { color: colors.mutedForeground }]}>{item.clicks ?? 0} klik</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.timerWrap}>
                    <Text style={[styles.timerLabel, { color: colors.mutedForeground }]}>Rete</Text>
                    <Text style={[styles.timerValue, { color: expired ? "#EF4444" : colors.accent }]}>{left}</Text>
                  </View>
                </View>
                <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => item.listing && router.push(`/listing/${item.listing.id}`)}>
                    <Feather name="eye" size={14} color={colors.primary} />
                    <Text style={[styles.actionText, { color: colors.primary }]}>Wè Annons</Text>
                  </TouchableOpacity>
                  {!expired && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleCancel(item.id)}>
                      <Feather name="x-circle" size={14} color="#EF4444" />
                      <Text style={[styles.actionText, { color: "#EF4444" }]}>Anile</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
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
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  actionBigBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  actionBigBtnText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  cardTop: { flexDirection: "row", padding: 14, gap: 12, alignItems: "flex-start" },
  cardImg: { width: 68, height: 68, borderRadius: 10 },
  cardInfo: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 19 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statsRow: { flexDirection: "row", gap: 12 },
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  timerWrap: { alignItems: "center", gap: 2 },
  timerLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  timerValue: { fontSize: 13, fontFamily: "Inter_700Bold" },
  cardActions: { flexDirection: "row", borderTopWidth: 1 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  actionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
