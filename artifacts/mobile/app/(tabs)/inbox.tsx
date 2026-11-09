import { StateView } from "@/components/StateView";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Conversation = {
  id: number;
  listingTitle?: string | null;
  listingImage?: string | null;
  otherUserName?: string | null;
  otherUserAvatar?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
  conversationType?: string;
  myRole?: string;
};

export default function InboxTab() {
  const { token, user, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<Conversation[]>([]);
  const [supportUnread, setSupportUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [convRes, supportRes] = await Promise.all([
        apiFetch("/conversations", { token, auth: true }),
        apiFetch("/support/unread-count", { token, auth: true }),
      ]);
      const convData = await convRes.json().catch(() => []);
      if (!convRes.ok) throw new Error(convData.error || `Inbox failed (${convRes.status})`);
      setRows(Array.isArray(convData) ? convData : []);
      if (supportRes.ok) {
        const s = await supportRes.json().catch(() => ({}));
        setSupportUnread(Number(s.count) || 0);
      }
    } catch (e: any) {
      setError(e?.message || "Could not load messages.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading) void load();
      const t = setInterval(() => {
        if (token) void load();
      }, 15000);
      return () => clearInterval(t);
    }, [authLoading, load, token]),
  );

  if (!authLoading && (!token || !user)) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.pad}>
          <Text style={styles.brand}>Flexa Market</Text>
          <Text style={styles.title}>Inbox</Text>
          <Text style={styles.muted}>Sign in to view buyer/seller chats and support.</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/auth/login")}>
            <Text style={styles.primaryText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>Flexa Market</Text>
          <Text style={styles.title}>Inbox</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconBtn} onPress={() => router.push("/notifications")}>
            <Feather name="bell" size={18} color="#F8FAFC" />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => router.push("/support")}>
            <Feather name="life-buoy" size={18} color="#F8FAFC" />
            {supportUnread > 0 ? <View style={styles.dot} /> : null}
          </Pressable>
        </View>
      </View>

      <StateView
        loading={loading && rows.length === 0}
        error={rows.length === 0 ? error : null}
        empty={!loading && !error && rows.length === 0}
        emptyTitle="No conversations yet"
        emptyDetail="Message a seller from a listing to start a chat."
        onRetry={load}
      >
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const image = resolveMediaUrl(item.listingImage || item.otherUserAvatar || null);
            const unread = Number(item.unreadCount) || 0;
            return (
              <Pressable style={styles.row} onPress={() => router.push(`/chat/${item.id}`)}>
                {image ? (
                  <Image source={{ uri: image }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Feather name="user" size={18} color="#64748B" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.otherUserName || "User"}
                    {item.myRole ? ` · ${item.myRole}` : ""}
                  </Text>
                  <Text style={styles.listing} numberOfLines={1}>
                    {item.listingTitle || item.conversationType || "Conversation"}
                  </Text>
                  <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={1}>
                    {item.lastMessage || "No messages yet"}
                  </Text>
                </View>
                {unread > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
                  </View>
                ) : (
                  <Feather name="chevron-right" size={18} color="#64748B" />
                )}
              </Pressable>
            );
          }}
        />
      </StateView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  pad: { padding: 20, gap: 10 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F97316",
  },
  brand: { fontSize: 22, fontWeight: "800", color: "#F8FAFC" },
  title: { fontSize: 14, fontWeight: "700", color: "#F97316" },
  muted: { color: "#94A3B8" },
  primary: {
    marginTop: 12,
    backgroundColor: "#F97316",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#1E293B" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  name: { color: "#F8FAFC", fontWeight: "700" },
  listing: { color: "#94A3B8", fontSize: 12, marginTop: 1 },
  preview: { color: "#64748B", fontSize: 13, marginTop: 2 },
  previewUnread: { color: "#CBD5E1", fontWeight: "600" },
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
});
