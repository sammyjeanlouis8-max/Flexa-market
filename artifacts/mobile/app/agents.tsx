/**
 * Wallet → Contacts / Agent directory — parity with web `/wallet/agents`.
 * Data: GET /api/agents/public · Chat: POST /api/agents/:userId/start-chat
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
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
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/request";

type Agent = {
  id: number;
  userId?: number;
  fullName?: string | null;
  businessName?: string | null;
  businessLocation?: string | null;
  city?: string | null;
  country?: string | null;
  whatsappNumber?: string | null;
  phone?: string | null;
  isOnline?: boolean;
  lastSeenAt?: string | null;
  userAvatar?: string | null;
  userName?: string | null;
  exchangeRate?: number | null;
  exchangeRateDop?: number | null;
  wholesaleRate?: number | null;
  retailRate?: number | null;
  saleType?: string | null;
  monthlyLimitUsd?: number | null;
  accountNumber?: string | null;
};

function timeAgo(date: string | null | undefined): string | null {
  if (!date) return null;
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function AgentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, isLoading: authLoading } = useAuth();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [filter, setFilter] = useState<"all" | "online">("all");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [chatLoading, setChatLoading] = useState<number | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else if (mode === "initial") setAgents(null);
      try {
        const res = await apiRequest<{ agents: Agent[] }>(
          `/agents/public${filter === "online" ? "?onlineOnly=1" : ""}`,
          { token },
        );
        setAgents(res.agents ?? []);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load agents");
        setAgents((p) => p ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token, filter],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load();
    }, [authLoading, token, router, load]),
  );

  useEffect(() => {
    if (token) void load();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const list = agents ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((a) =>
      [a.fullName, a.businessName, a.city, a.country, a.userName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [agents, q]);

  const startChat = async (agentUserId: number) => {
    if (!token || !agentUserId) return;
    setChatLoading(agentUserId);
    try {
      const data = await apiRequest<{ conversationId?: number | string }>(
        `/agents/${agentUserId}/start-chat`,
        { token, method: "POST", body: {} },
      );
      const id = data?.conversationId;
      if (id == null) throw new Error("No conversation returned");
      router.push(`/chat/${id}` as any);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open chat");
    } finally {
      setChatLoading(null);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Agent directory" showBack showCart={false} />
      <View style={styles.toolbar}>
        <View style={styles.search}>
          <Feather name="search" size={16} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="Search city or name"
            placeholderTextColor="#94A3B8"
            testID="agents-search"
          />
        </View>
        <Pressable
          style={styles.refreshBtn}
          onPress={() => void load("refresh")}
          accessibilityLabel="Refresh agents"
          testID="agents-refresh"
        >
          <Feather name="refresh-cw" size={18} color={colors.flexaGreen} />
        </Pressable>
      </View>

      <View style={styles.filters}>
        {(["all", "online"] as const).map((f) => {
          const on = filter === f;
          return (
            <Pressable
              key={f}
              style={[styles.filter, on && styles.filterOn]}
              onPress={() => setFilter(f)}
              testID={`agents-filter-${f}`}
            >
              <Feather
                name={f === "all" ? "users" : "wifi"}
                size={14}
                color={on ? "#fff" : "#64748B"}
              />
              <Text style={[styles.filterText, on && styles.filterTextOn]}>
                {f === "all" ? "All agents" : "Online"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {agents === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(a) => String(a.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.flexaGreen}
            />
          }
          contentContainerStyle={
            !filtered.length
              ? { flexGrow: 1, justifyContent: "center", padding: 24, paddingBottom: insets.bottom + 24 }
              : { padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }
          }
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 4 }}>
              <View style={styles.trust}>
                <Feather name="shield" size={16} color="#15803D" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.trustTitle}>Verified cash agents</Text>
                  <Text style={styles.trustBody}>
                    Approved agents for cash in / cash out. Chat in-app or WhatsApp when listed.
                  </Text>
                </View>
              </View>
              {error ? (
                <View style={styles.banner}>
                  <Text style={styles.bannerText}>{error}</Text>
                  <Pressable
                    style={styles.retry}
                    onPress={() => void load("refresh")}
                    testID="agents-retry"
                  >
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Feather name="users" size={36} color="#94A3B8" />
              <Text style={styles.empty}>No agents found</Text>
              <Text style={styles.emptyHint}>
                Try All agents, clear search, or check back later for your country.
              </Text>
              <Pressable style={styles.backWallet} onPress={() => router.replace("/wallet")}>
                <Feather name="arrow-left" size={14} color={colors.flexaGreen} />
                <Text style={styles.backWalletText}>Back to Wallet</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => {
            const name = item.fullName || item.businessName || item.userName || "Agent";
            const phone = item.whatsappNumber || item.phone;
            const agentUserId = Number(item.userId ?? item.id);
            const chatting = chatLoading === agentUserId;
            return (
              <View
                style={[styles.card, item.isOnline && styles.cardOnline]}
                testID={`agent-card-${item.id}`}
              >
                <View style={styles.rowTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{String(name).charAt(0).toUpperCase()}</Text>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: item.isOnline ? "#22C55E" : "#94A3B8" },
                      ]}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={[styles.badge, item.isOnline ? styles.badgeOn : styles.badgeOff]}>
                        {item.isOnline ? "Online" : "Offline"}
                      </Text>
                    </View>
                    {item.businessName ? (
                      <Text style={styles.meta} numberOfLines={1}>
                        {item.businessName}
                      </Text>
                    ) : null}
                    <Text style={styles.meta} numberOfLines={1}>
                      {[item.city, item.country].filter(Boolean).join(", ") || "Location TBD"}
                    </Text>
                    {!item.isOnline && item.lastSeenAt ? (
                      <Text style={styles.seen}>{timeAgo(item.lastSeenAt)}</Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.chips}>
                  {item.wholesaleRate != null ? (
                    <Text style={styles.chip}>Wholesale {Number(item.wholesaleRate).toFixed(1)} HTG/$</Text>
                  ) : null}
                  {item.retailRate != null ? (
                    <Text style={[styles.chip, styles.chipViolet]}>
                      Retail {Number(item.retailRate).toFixed(1)} HTG/$
                    </Text>
                  ) : null}
                  {item.wholesaleRate == null &&
                  item.retailRate == null &&
                  item.exchangeRate != null ? (
                    <Text style={[styles.chip, styles.chipViolet]}>
                      Rate {Number(item.exchangeRate).toFixed(1)} HTG/$
                    </Text>
                  ) : null}
                  {item.exchangeRateDop != null ? (
                    <Text style={[styles.chip, styles.chipOrange]}>
                      {Number(item.exchangeRateDop).toFixed(1)} RD/$
                    </Text>
                  ) : null}
                </View>

                <View style={styles.footer}>
                  <Text style={styles.limit}>
                    <Text style={styles.limitStrong}>
                      ${Number(item.monthlyLimitUsd ?? 0).toLocaleString()}
                    </Text>{" "}
                    monthly limit
                  </Text>
                  <View style={styles.actions}>
                    {phone ? (
                      <Pressable
                        style={styles.waBtn}
                        onPress={() =>
                          Linking.openURL(`https://wa.me/${String(phone).replace(/\D/g, "")}`)
                        }
                        testID={`agent-wa-${item.id}`}
                      >
                        <Feather name="phone" size={12} color="#15803D" />
                        <Text style={styles.waText}>WhatsApp</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={styles.chatBtn}
                      disabled={chatting || !agentUserId}
                      onPress={() => void startChat(agentUserId)}
                      testID={`agent-chat-${item.id}`}
                    >
                      {chatting ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Feather name="message-circle" size={12} color="#fff" />
                          <Text style={styles.chatText}>Message</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
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
  root: { flex: 1, backgroundColor: colors.light.background },
  toolbar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    alignItems: "center",
  },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 42,
  },
  searchInput: { flex: 1, color: colors.light.text, paddingVertical: 0 },
  refreshBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  filters: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  filter: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  filterOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  filterText: { fontWeight: "700", color: "#64748B", fontSize: 13 },
  filterTextOn: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  trust: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    padding: 12,
  },
  trustTitle: { fontWeight: "800", color: "#166534", fontSize: 12 },
  trustBody: { color: "#15803D", fontSize: 11, marginTop: 2, lineHeight: 15 },
  banner: {
    backgroundColor: "#FEF2F2",
    padding: 10,
    borderRadius: 10,
    gap: 8,
  },
  bannerText: { color: "#B91C1C", fontSize: 13 },
  retry: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryText: { color: "#B91C1C", fontWeight: "800", fontSize: 12 },
  emptyWrap: { alignItems: "center", gap: 8 },
  empty: { textAlign: "center", color: colors.light.text, fontWeight: "800", fontSize: 16 },
  emptyHint: { textAlign: "center", color: "#94A3B8", fontSize: 13, maxWidth: 280 },
  backWallet: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: "#fff",
  },
  backWalletText: { color: colors.flexaGreen, fontWeight: "800", fontSize: 13 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
  },
  cardOnline: { borderColor: "#86EFAC", backgroundColor: "#F0FDF4" },
  rowTop: { flexDirection: "row", gap: 12 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontWeight: "900", color: colors.flexaGreen },
  statusDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#fff",
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontWeight: "800", fontSize: 14, color: colors.light.text, flex: 1 },
  badge: { fontSize: 10, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeOn: { backgroundColor: "#DCFCE7", color: "#15803D", overflow: "hidden" },
  badgeOff: { backgroundColor: "#F1F5F9", color: "#64748B", overflow: "hidden" },
  meta: { color: "#64748B", marginTop: 2, fontSize: 12 },
  seen: { color: "#94A3B8", fontSize: 11, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803D",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  chipViolet: { color: "#6D28D9", backgroundColor: "#EDE9FE" },
  chipOrange: { color: "#C2410C", backgroundColor: "#FFEDD5" },
  footer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.light.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  limit: { color: "#64748B", fontSize: 11, flex: 1 },
  limitStrong: { color: colors.light.text, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 6, alignItems: "center" },
  waBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  waText: { color: "#15803D", fontWeight: "800", fontSize: 11 },
  chatBtn: {
    minWidth: 84,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.flexaGreen,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
  },
  chatText: { color: "#fff", fontWeight: "800", fontSize: 11 },
});
