import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Platform, Pressable,
  RefreshControl, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi, Listing } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

export default function FavoritesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFavorites = useCallback(async () => {
    try {
      const data = await request<{ favorites?: Listing[]; listings?: Listing[] } | Listing[]>("/favorites");
      const list = Array.isArray(data)
        ? data
        : (data as any).favorites ?? (data as any).listings ?? [];
      setItems(list);
    } catch { setItems([]); }
  }, [request]);

  useEffect(() => { fetchFavorites().finally(() => setLoading(false)); }, [fetchFavorites]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchFavorites();
    setRefreshing(false);
  }, [fetchFavorites]);

  async function removeFavorite(id: number) {
    try {
      await request(`/favorites/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {}
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Sauvegardés</Text>
        <Text style={[styles.headerCount, { color: colors.mutedForeground }]}>{items.length}</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.center}>
          <Feather name="heart" size={52} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Okenn favori</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Annons ou sove yo ap parèt la</Text>
          <Pressable style={[styles.browseBtn, { backgroundColor: colors.accent }]} onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.browseBtnText}>Eksplore Annons</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => String(i.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push(`/listing/${item.id}`)}
              activeOpacity={0.85}
            >
              <Image
                source={{ uri: Array.isArray(item.images) && item.images[0] ? item.images[0] : undefined }}
                style={styles.cardImg}
                contentFit="cover"
                placeholder={{ uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" }}
              />
              <TouchableOpacity style={styles.heartBtn} onPress={() => removeFavorite(item.id)}>
                <Feather name="heart" size={16} color="#EF4444" />
              </TouchableOpacity>
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
                <Text style={[styles.cardPrice, { color: colors.accent }]}>${Number(item.price).toFixed(2)}</Text>
                {item.location ? (
                  <View style={styles.locRow}>
                    <Feather name="map-pin" size={10} color={colors.mutedForeground} />
                    <Text style={[styles.locText, { color: colors.mutedForeground }]} numberOfLines={1}>{item.location}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          )}
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
  headerCount: { fontSize: 14, fontFamily: "Inter_400Regular" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  browseBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  browseBtnText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  row: { justifyContent: "space-between" },
  card: { width: "48.5%", borderRadius: 14, borderWidth: 1, overflow: "hidden", marginBottom: 12 },
  cardImg: { width: "100%", height: 130, backgroundColor: "#1e293b" },
  heartBtn: { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 16, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  cardInfo: { padding: 10, gap: 3 },
  cardTitle: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  cardPrice: { fontSize: 14, fontFamily: "Inter_700Bold" },
  locRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  locText: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
