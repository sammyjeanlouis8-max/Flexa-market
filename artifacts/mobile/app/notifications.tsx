import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Platform, Pressable,
  RefreshControl, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

interface Notif {
  id: number;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  listingId?: number;
  link?: string;
}

const ICON_MAP: Record<string, "bell" | "shopping-bag" | "message-circle" | "heart" | "dollar-sign" | "truck" | "star" | "alert-circle"> = {
  order: "shopping-bag",
  message: "message-circle",
  offer: "dollar-sign",
  favorite: "heart",
  delivery: "truck",
  review: "star",
  default: "bell",
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "kounye a";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifs = useCallback(async () => {
    try {
      const data = await request<{ notifications?: Notif[] } | Notif[]>("/notifications");
      const list = Array.isArray(data) ? data : (data as any).notifications ?? [];
      setNotifs(list);
    } catch { setNotifs([]); }
  }, [request]);

  useEffect(() => { fetchNotifs().finally(() => setLoading(false)); }, [fetchNotifs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotifs();
    setRefreshing(false);
  }, [fetchNotifs]);

  async function markAllRead() {
    try {
      await request("/notifications/read-all", { method: "POST" });
      setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {}
  }

  async function markRead(id: number) {
    try {
      await request(`/notifications/${id}/read`, { method: "POST" });
      setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
    } catch {}
  }

  const unreadCount = notifs.filter((n) => !n.isRead).length;
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Notifikasyon</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={[styles.markAll, { color: colors.primary }]}>Li tout</Text>
          </TouchableOpacity>
        )}
      </View>

      {notifs.length === 0 ? (
        <View style={styles.center}>
          <Feather name="bell-off" size={52} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Okenn notifikasyon</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Ou pa gen notifikasyon pou kounye a</Text>
        </View>
      ) : (
        <FlatList
          data={notifs}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const iconKey = Object.keys(ICON_MAP).find((k) => item.type?.toLowerCase().includes(k)) ?? "default";
            const icon = ICON_MAP[iconKey as keyof typeof ICON_MAP];
            return (
              <TouchableOpacity
                style={[styles.item, { backgroundColor: item.isRead ? colors.background : colors.primary + "0D", borderBottomColor: colors.border }]}
                onPress={() => { markRead(item.id); if (item.listingId) router.push(`/listing/${item.listingId}`); }}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, { backgroundColor: item.isRead ? colors.muted : colors.primary + "22" }]}>
                  <Feather name={icon} size={20} color={item.isRead ? colors.mutedForeground : colors.primary} />
                </View>
                <View style={styles.itemBody}>
                  <Text style={[styles.itemTitle, { color: colors.foreground }]}>{item.title}</Text>
                  <Text style={[styles.itemMsg, { color: colors.mutedForeground }]} numberOfLines={2}>{item.message}</Text>
                  <Text style={[styles.itemTime, { color: colors.mutedForeground }]}>{timeAgo(item.createdAt)}</Text>
                </View>
                {!item.isRead && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
              </TouchableOpacity>
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
  markAll: { fontSize: 13, fontFamily: "Inter_500Medium" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  item: { flexDirection: "row", alignItems: "flex-start", padding: 16, gap: 12, borderBottomWidth: 1 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  itemBody: { flex: 1, gap: 3 },
  itemTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  itemMsg: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  itemTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0 },
});
