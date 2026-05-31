import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Platform, Pressable,
  RefreshControl, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useApi, Listing } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

const STATUS_COLORS: Record<string, string> = {
  active: "#22C55E",
  sold: "#6366F1",
  inactive: "#94A3B8",
  pending: "#F59E0B",
};

export default function MyListingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { request } = useApi();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchListings = useCallback(async () => {
    if (!user) return;
    try {
      const data = await request<{ listings?: Listing[] } | Listing[]>(`/users/${user.id}/listings`);
      const list = Array.isArray(data) ? data : (data as any).listings ?? [];
      setListings(list);
    } catch { setListings([]); }
  }, [request, user]);

  useEffect(() => { fetchListings().finally(() => setLoading(false)); }, [fetchListings]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchListings();
    setRefreshing(false);
  }, [fetchListings]);

  async function handleDelete(id: number, title: string) {
    Alert.alert("Efase Annons?", `Ou vle efase "${title}"?`, [
      { text: "Anile", style: "cancel" },
      { text: "Efase", style: "destructive", onPress: async () => {
        try {
          await request(`/listings/${id}`, { method: "DELETE" });
          setListings((prev) => prev.filter((l) => l.id !== id));
        } catch (e: any) { Alert.alert("Erè", e?.message ?? "Erè efase"); }
      }},
    ]);
  }

  async function handleMarkSold(id: number) {
    try {
      await request(`/listings/${id}/mark-sold`, { method: "POST" });
      setListings((prev) => prev.map((l) => l.id === id ? { ...l, status: "sold" } : l));
    } catch (e: any) { Alert.alert("Erè", e?.message ?? "Erè"); }
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Mes Annonces</Text>
        <TouchableOpacity onPress={() => router.push("/(tabs)/sell")} style={styles.addBtn}>
          <Feather name="plus" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {listings.length === 0 ? (
        <View style={styles.center}>
          <Feather name="package" size={52} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Okenn annons</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Kòmanse vann kounye a!</Text>
          <Pressable style={[styles.sellBtn, { backgroundColor: colors.accent }]} onPress={() => router.push("/(tabs)/sell")}>
            <Feather name="plus" size={18} color="#FFF" />
            <Text style={styles.sellBtnText}>Kreye Annons</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(l) => String(l.id)}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const statusColor = STATUS_COLORS[(item as any).status ?? "active"] ?? "#94A3B8";
            const img = Array.isArray(item.images) ? item.images[0] : null;
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity style={styles.cardMain} onPress={() => router.push(`/listing/${item.id}`)} activeOpacity={0.85}>
                  {img ? (
                    <Image source={{ uri: img }} style={styles.cardImg} contentFit="cover" />
                  ) : (
                    <View style={[styles.cardImg, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
                      <Feather name="image" size={24} color={colors.mutedForeground} />
                    </View>
                  )}
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
                    <Text style={[styles.cardPrice, { color: colors.accent }]}>${Number(item.price).toFixed(2)}</Text>
                    <View style={styles.metaRow}>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>{(item as any).status ?? "active"}</Text>
                      </View>
                      {item.location ? (
                        <View style={styles.locRow}>
                          <Feather name="map-pin" size={10} color={colors.mutedForeground} />
                          <Text style={[styles.locText, { color: colors.mutedForeground }]} numberOfLines={1}>{item.location}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>

                <View style={[styles.actions, { borderTopColor: colors.border }]}>
                  {(item as any).status !== "sold" && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleMarkSold(item.id)}>
                      <Feather name="check-circle" size={15} color="#6366F1" />
                      <Text style={[styles.actionText, { color: "#6366F1" }]}>Mak Vann</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.actionBtn} onPress={() => router.push(`/listing/${item.id}`)}>
                    <Feather name="eye" size={15} color={colors.mutedForeground} />
                    <Text style={[styles.actionText, { color: colors.mutedForeground }]}>Wè</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item.id, item.title)}>
                    <Feather name="trash-2" size={15} color="#EF4444" />
                    <Text style={[styles.actionText, { color: "#EF4444" }]}>Efase</Text>
                  </TouchableOpacity>
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
  headerTitle: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold" },
  addBtn: { padding: 4 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  sellBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  sellBtnText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  cardMain: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12 },
  cardImg: { width: 72, height: 72, borderRadius: 10 },
  cardInfo: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 19 },
  cardPrice: { fontSize: 15, fontFamily: "Inter_700Bold" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  locRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  locText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  actions: { flexDirection: "row", borderTopWidth: 1 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10 },
  actionText: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
