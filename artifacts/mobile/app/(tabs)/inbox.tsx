/**
 * Messages inbox — matches Flexa Market web/iOS Messages reference (IMG_6348).
 * White marketplace header, Messages toolbar, search + chips, conversation rows,
 * blue Messages tab (set in tabs layout).
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { bottomTabBarHeight } from "@/constants/layoutMetrics";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
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
import { fetchUnreadCount as fetchNotifUnread } from "@/lib/notificationsApi";

type ChipFilter = "all" | "buyers" | "sellers" | "unread";

const AVATAR_COLORS = [
  "#0EA5E9",
  "#8B5CF6",
  "#146C43",
  "#F97316",
  "#EC4899",
  "#6366F1",
  "#14B8A6",
  "#EF4444",
];

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string | null | undefined): string {
  const parts = (name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function mediaUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith("http")) return raw;
  if (raw.startsWith("/")) return `https://flexamarket.com${raw}`;
  return raw;
}

function isSupportOrSystem(c: Conversation): boolean {
  const t = c.conversationType || "";
  return t === "system_notifications" || t === "support" || t === "agent_recharge";
}

export default function InboxTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { toggleDark, isDark } = useTheme();
  const [rows, setRows] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<ChipFilter>("all");
  const [query, setQuery] = useState("");
  const [bellBadge, setBellBadge] = useState(0);

  const tabPad = bottomTabBarHeight(insets.bottom);

  const load = useCallback(
    async (mode: "initial" | "refresh" | "silent" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else if (mode === "initial") setError(null);
      try {
        const [data, notifN] = await Promise.all([
          fetchConversations({ token }),
          fetchNotifUnread({ token }).catch(() => 0),
        ]);
        setRows(data);
        setBellBadge(notifN);
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

  const counts = useMemo(() => {
    const list = rows ?? [];
    return {
      all: list.length,
      buyers: list.filter((c) => c.myRole === "seller" && !isSupportOrSystem(c)).length,
      sellers: list.filter((c) => c.myRole === "buyer" && !isSupportOrSystem(c)).length,
      unread: list.filter((c) => (c.unreadCount || 0) > 0).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    let list = rows;
    if (filter === "buyers") {
      list = list.filter((c) => c.myRole === "seller" && !isSupportOrSystem(c));
    } else if (filter === "sellers") {
      list = list.filter((c) => c.myRole === "buyer" && !isSupportOrSystem(c));
    } else if (filter === "unread") {
      list = list.filter((c) => (c.unreadCount || 0) > 0);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const hay = `${c.otherUserName} ${c.listingTitle} ${c.lastMessage || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [rows, filter, query]);

  const onCompose = () => {
    Alert.alert(
      "New message",
      "Open a product and tap Message to start a conversation with a buyer or seller.",
      [
        { text: "Browse products", onPress: () => router.push("/") },
        { text: "OK", style: "cancel" },
      ],
    );
  };

  const renderItem = ({ item }: { item: Conversation }) => {
    const unread = (item.unreadCount || 0) > 0;
    const avatar = mediaUrl(item.otherUserAvatar);
    const verified = !!item.otherUserIsVerified;
    return (
      <Pressable
        style={styles.row}
        onPress={() => router.push(`/chat/${item.id}`)}
        testID={`inbox-row-${item.id}`}
      >
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View
            style={[
              styles.avatar,
              styles.avatarInitials,
              { backgroundColor: avatarColor(item.otherUserName || String(item.id)) },
            ]}
          >
            <Text style={styles.avatarLetter}>{initials(item.otherUserName)}</Text>
          </View>
        )}
        <View style={styles.meta}>
          <View style={styles.topLine}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>
                {item.otherUserName || "Chat"}
              </Text>
              {verified ? (
                <View style={styles.verified}>
                  <Feather name="check" size={10} color="#FFFFFF" />
                </View>
              ) : null}
            </View>
            <Text style={styles.time}>{formatMessageTime(item.lastMessageAt)}</Text>
          </View>
          <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
            {item.lastMessage || "No messages yet"}
          </Text>
          {item.listingTitle ? (
            <View style={styles.productRow}>
              <Feather name="shopping-bag" size={12} color={colors.flexaGreen} />
              <Text style={styles.product} numberOfLines={1}>
                {item.listingTitle}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const chips: { key: ChipFilter; label: string; count?: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "buyers", label: "Buyers", count: counts.buyers },
    { key: "sellers", label: "Sellers", count: counts.sellers },
    { key: "unread", label: "Unread" },
  ];

  return (
    <View style={styles.root} testID="messages-inbox">
      <AppHeader variant="light" bellBadge={bellBadge} />

      <View style={styles.toolbar}>
        <Pressable
          style={styles.backCircle}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          accessibilityLabel="Back"
        >
          <Feather name="chevron-left" size={22} color={colors.flexaGreen} />
        </Pressable>
        <Feather name="message-circle" size={22} color={colors.flexaGreen} style={{ marginLeft: 4 }} />
        <Text style={styles.pageTitle}>Messages</Text>
        <View style={{ flex: 1 }} />
        <Pressable
          style={styles.moonBtn}
          onPress={toggleDark}
          accessibilityLabel={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          <Feather name={isDark ? "sun" : "moon"} size={18} color="#64748B" />
        </Pressable>
        <Pressable
          style={styles.composeBtn}
          onPress={onCompose}
          accessibilityLabel="Compose message"
          testID="inbox-compose"
        >
          <Feather name="edit" size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <Feather name="search" size={18} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search a conversation..."
            placeholderTextColor="#94A3B8"
            returnKeyType="search"
            autoCorrect={false}
            testID="inbox-search"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Feather name="x" size={16} color="#94A3B8" />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          style={styles.filterBtn}
          onPress={() => {
            const order: ChipFilter[] = ["all", "buyers", "sellers", "unread"];
            const idx = order.indexOf(filter);
            setFilter(order[(idx + 1) % order.length]);
          }}
          accessibilityLabel="Cycle filters"
        >
          <Feather name="sliders" size={18} color="#64748B" />
        </Pressable>
      </View>

      <View style={styles.chipsRow}>
        {chips.map((c) => {
          const on = filter === c.key;
          const label =
            c.count !== undefined ? `${c.label} (${c.count})` : c.label;
          return (
            <Pressable
              key={c.key}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => setFilter(c.key)}
              testID={`inbox-chip-${c.key}`}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {rows === null && !error ? (
        <ActivityIndicator color={colors.flexaGreen} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.flexaGreen}
            />
          }
          contentContainerStyle={{ paddingBottom: tabPad + 16, flexGrow: 1 }}
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
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 6,
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginLeft: 4,
    letterSpacing: -0.3,
  },
  moonBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  composeBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 10,
  },
  searchField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#0F172A",
    paddingVertical: 0,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  chipOn: {
    backgroundColor: colors.flexaGreen,
    borderColor: colors.flexaGreen,
  },
  chipText: { fontWeight: "700", color: "#0F172A", fontSize: 13 },
  chipTextOn: { color: "#FFFFFF" },
  error: {
    color: "#B91C1C",
    marginHorizontal: 16,
    marginBottom: 8,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginLeft: 76,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarInitials: { alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  meta: { flex: 1, minWidth: 0 },
  topLine: { flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },
  name: { flexShrink: 1, fontSize: 15, fontWeight: "700", color: "#0F172A" },
  nameUnread: { fontWeight: "800" },
  verified: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  time: { fontSize: 12, color: "#94A3B8", fontWeight: "500" },
  preview: { fontSize: 13, color: "#64748B", marginTop: 3 },
  previewUnread: { color: "#334155", fontWeight: "600" },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  product: {
    flex: 1,
    fontSize: 12,
    color: colors.flexaGreen,
    fontWeight: "600",
  },
  empty: { alignItems: "center", paddingTop: 64, paddingHorizontal: 24, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A", marginTop: 8 },
  emptyBody: { textAlign: "center", color: "#94A3B8", lineHeight: 20 },
});
