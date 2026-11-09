/**
 * Flexa Chat Pro Max — Inbox (Kominike)
 * GET /api/conversations — buyer/seller filters, unread badges, realtime updates.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  fetchConversations,
  formatMessageTime,
  type Conversation,
} from "@/lib/chatApi";
import {
  getChatSocket,
  onConvUpdate,
  onNewMessage,
  presenceJoin,
} from "@/lib/chatSocket";

type RoleFilter = "all" | "buyer" | "seller";

export default function InboxTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<RoleFilter>("all");

  const load = useCallback(
    async (mode: "initial" | "refresh" | "silent" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else if (mode === "initial") setError(null);
      try {
        const data = await fetchConversations({ token });
        setRows(data);
        setError(null);
      } catch (e) {
        if (mode !== "silent") {
          setError(e instanceof Error ? e.message : "Could not load messages");
        }
        setRows((prev) => prev ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (!token) return;
      void load("initial");
      if (user?.id) presenceJoin(user.id);
      getChatSocket().connect();

      const offMsg = onNewMessage(() => {
        void load("silent");
      });
      const offConv = onConvUpdate(() => {
        void load("silent");
      });
      const poll = setInterval(() => {
        void load("silent");
      }, 20000);

      return () => {
        offMsg();
        offConv();
        clearInterval(poll);
      };
    }, [authLoading, token, user?.id, router, load]),
  );

  const filtered = useMemo(() => {
    if (!rows) return null;
    if (filter === "all") return rows;
    return rows.filter((c) => c.myRole === filter);
  }, [rows, filter]);

  const totalUnread = useMemo(
    () => (rows ?? []).reduce((s, c) => s + (c.unreadCount || 0), 0),
    [rows],
  );

  const renderItem = ({ item }: { item: Conversation }) => {
    const unread = (item.unreadCount || 0) > 0;
    return (
      <Pressable
        style={[styles.row, unread && styles.rowUnread]}
        onPress={() => router.push(`/chat/${item.id}`)}
      >
        {item.otherUserAvatar || item.listingImage ? (
          <Image
            source={{ uri: item.otherUserAvatar || item.listingImage || undefined }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty]}>
            <Feather name="user" size={20} color="#94A3B8" />
          </View>
        )}
        <View style={styles.meta}>
          <View style={styles.topLine}>
            <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>
              {item.otherUserName || "Chat"}
            </Text>
            <Text style={styles.time}>{formatMessageTime(item.lastMessageAt)}</Text>
          </View>
          <Text style={styles.listing} numberOfLines={1}>
            {item.listingTitle}
          </Text>
          <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
            {item.lastMessage || "No messages yet"}
          </Text>
        </View>
        {unread ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {item.unreadCount > 99 ? "99+" : String(item.unreadCount)}
            </Text>
          </View>
        ) : (
          <Feather name="chevron-right" size={16} color="#CBD5E1" />
        )}
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Flexa Chat</Text>
          <Text style={styles.subtitle}>
            {totalUnread > 0 ? `${totalUnread} unread` : "Messages with buyers & sellers"}
          </Text>
        </View>
        <Pressable style={styles.notifBtn} onPress={() => router.push("/notifications")}>
          <Feather name="bell" size={18} color="#0F172A" />
        </Pressable>
      </View>

      <View style={styles.filters}>
        {(
          [
            ["all", "All"],
            ["buyer", "Buying"],
            ["seller", "Selling"],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            style={[styles.chip, filter === key && styles.chipOn]}
            onPress={() => setFilter(key)}
          >
            <Text style={[styles.chipText, filter === key && styles.chipTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {rows === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor="#F97316"
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="message-circle" size={36} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptyBody}>
                Open a listing and tap Message to start a real buyer–seller chat.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: "800", color: "#0F172A", letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: "#64748B", marginTop: 2 },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  filters: { flexDirection: "row", gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#FFF7ED", borderColor: "#F97316" },
  chipText: { fontWeight: "700", color: "#64748B", fontSize: 13 },
  chipTextOn: { color: "#C2410C" },
  error: { color: "#B91C1C", marginBottom: 8, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 8,
  },
  rowUnread: { borderColor: "#FED7AA", backgroundColor: "#FFFBEB" },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarEmpty: {
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { flex: 1, minWidth: 0 },
  topLine: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: "700", color: "#0F172A" },
  nameUnread: { fontWeight: "800" },
  time: { fontSize: 11, color: "#94A3B8", fontWeight: "600" },
  listing: { fontSize: 12, color: "#F97316", fontWeight: "600", marginTop: 2 },
  preview: { fontSize: 13, color: "#64748B", marginTop: 2 },
  previewUnread: { color: "#0F172A", fontWeight: "600" },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  empty: { alignItems: "center", paddingTop: 64, paddingHorizontal: 24, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A", marginTop: 8 },
  emptyBody: { textAlign: "center", color: "#94A3B8", lineHeight: 20 },
});
