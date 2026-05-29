import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi, Conversation } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "kounye a";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}j`;
}

function ConvItem({ item }: { item: Conversation }) {
  const colors = useColors();
  const avatar = item.otherUser?.avatarUrl;
  const name = item.otherUser?.name ?? "Itilizatè";
  const initials = name.slice(0, 2).toUpperCase();
  const unread = (item.unreadCount ?? 0) > 0;

  return (
    <TouchableOpacity style={[styles.convRow, { borderBottomColor: colors.border }]} onPress={() => router.push(`/chat/${item.id}`)}>
      <View style={styles.avatarWrap}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
        )}
        {unread && <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />}
      </View>

      <View style={styles.convInfo}>
        <View style={styles.convTop}>
          <Text style={[styles.convName, { color: colors.foreground, fontFamily: unread ? "Inter_600SemiBold" : "Inter_500Medium" }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.convTime, { color: colors.mutedForeground }]}>
            {item.lastMessageAt ? timeAgo(item.lastMessageAt) : ""}
          </Text>
        </View>
        <Text style={[styles.convListing, { color: colors.primary }]} numberOfLines={1}>
          {item.listing?.title ?? ""}
        </Text>
        <Text style={[styles.convMsg, { color: unread ? colors.foreground : colors.mutedForeground, fontFamily: unread ? "Inter_500Medium" : "Inter_400Regular" }]} numberOfLines={1}>
          {item.lastMessage ?? "Kòmanse konvèsasyon"}
        </Text>
      </View>

      {item.listing?.images?.[0] && (
        <Image
          source={{ uri: item.listing.images[0] }}
          style={[styles.listingThumb, { borderColor: colors.border }]}
          contentFit="cover"
        />
      )}
    </TouchableOpacity>
  );
}

export default function InboxScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConvs = useCallback(async () => {
    try {
      const data = await request<Conversation[]>("/conversations");
      setConversations(Array.isArray(data) ? data : []);
    } catch {
      setConversations([]);
    }
  }, [request]);

  useEffect(() => {
    fetchConvs().finally(() => setLoading(false));
  }, [fetchConvs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchConvs();
    setRefreshing(false);
  }, [fetchConvs]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Mesaj</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="message-circle" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Pa gen mesaj</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Konvèsasyon ou yo ap parèt isit la lè ou kòmanse pale ak yon vandè.
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <ConvItem item={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          scrollEnabled={!!conversations.length}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  convRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  avatarWrap: { position: "relative" },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarFallback: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  avatarInitials: { color: "#FFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  unreadDot: { position: "absolute", bottom: 1, right: 1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: "#FFF" },
  convInfo: { flex: 1, gap: 2 },
  convTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  convName: { fontSize: 15, flex: 1, marginRight: 8 },
  convTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  convListing: { fontSize: 12, fontFamily: "Inter_500Medium" },
  convMsg: { fontSize: 13, marginTop: 1 },
  listingThumb: { width: 44, height: 44, borderRadius: 8, borderWidth: 1 },
});
