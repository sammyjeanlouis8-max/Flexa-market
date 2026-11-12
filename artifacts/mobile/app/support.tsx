/**
 * Support tickets list — GET/POST /api/support/threads
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
import { apiRequest, formatWhen } from "@/lib/request";

type Thread = {
  id: number;
  ticketRef?: string;
  subject: string;
  status: string;
  priority?: string;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadByUser?: number;
  createdAt?: string;
};

export default function SupportListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [compose, setCompose] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const data = await apiRequest<Thread[]>("/support/threads", { token });
        setThreads(Array.isArray(data) ? data : []);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load tickets");
        setThreads((prev) => prev ?? []);
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
      if (token) void load("initial");
    }, [authLoading, token, router, load]),
  );

  const createTicket = async () => {
    if (!token || !subject.trim() || !message.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await apiRequest<{ id: number }>("/support/threads", {
        token,
        method: "POST",
        body: { subject: subject.trim(), message: message.trim() },
      });
      setCompose(false);
      setSubject("");
      setMessage("");
      router.push(`/support/${res.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Could not create ticket");
    } finally {
      setCreating(false);
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "open":
        return "#2563EB";
      case "in_progress":
        return colors.flexaOrange;
      case "waiting_customer":
        return "#CA8A04";
      case "closed":
        return "#64748B";
      default:
        return colors.flexaGreen;
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader
        title="Support"
        showBack
        rightExtra={
          <Pressable style={styles.headerBtn} onPress={() => setCompose(true)}>
            <Feather name="plus" size={20} color="#fff" />
          </Pressable>
        }
      />
      {threads === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={threads ?? []}
          keyExtractor={(t) => String(t.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.flexaGreen}
            />
          }
          contentContainerStyle={
            !(threads && threads.length)
              ? { flexGrow: 1, justifyContent: "center", padding: 24 }
              : { padding: 16, paddingBottom: 40 }
          }
          ListHeaderComponent={
            error ? (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>{error}</Text>
                <Pressable onPress={() => void load("initial")}>
                  <Text style={styles.retry}>Retry</Text>
                </Pressable>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="life-buoy" size={36} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No support tickets yet</Text>
              <Text style={styles.emptySub}>
                Open a ticket and our team will reply in-app.
              </Text>
              <Pressable style={styles.cta} onPress={() => setCompose(true)}>
                <Text style={styles.ctaText}>New ticket</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/chatbot")}>
                <Text style={styles.link}>Or ask FlexaBot</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/support/${item.id}`)}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.ref}>#{item.ticketRef || item.id}</Text>
                  <View style={[styles.badge, { backgroundColor: `${statusColor(item.status)}22` }]}>
                    <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>
                      {item.status.replace(/_/g, " ")}
                    </Text>
                  </View>
                </View>
                <Text style={styles.subject} numberOfLines={1}>
                  {item.subject}
                </Text>
                {item.lastMessage ? (
                  <Text style={styles.preview} numberOfLines={1}>
                    {item.lastMessage}
                  </Text>
                ) : null}
                <Text style={styles.when}>
                  {formatWhen(item.lastMessageAt || item.createdAt)}
                </Text>
              </View>
              {(item.unreadByUser ?? 0) > 0 ? (
                <View style={styles.unread}>
                  <Text style={styles.unreadText}>{item.unreadByUser}</Text>
                </View>
              ) : (
                <Feather name="chevron-right" size={18} color="#94A3B8" />
              )}
            </Pressable>
          )}
        />
      )}

      <Modal visible={compose} animationType="slide" onRequestClose={() => setCompose(false)}>
        <View style={[styles.modal, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.modalBar}>
            <Pressable onPress={() => setCompose(false)}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>New ticket</Text>
            <Pressable onPress={() => void createTicket()} disabled={creating}>
              <Text style={[styles.send, creating && { opacity: 0.5 }]}>
                {creating ? "…" : "Send"}
              </Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Subject"
            placeholderTextColor="#94A3B8"
            value={subject}
            onChangeText={setSubject}
            maxLength={120}
          />
          <TextInput
            style={[styles.input, styles.message]}
            placeholder="Describe your issue…"
            placeholderTextColor="#94A3B8"
            value={message}
            onChangeText={setMessage}
            multiline
            textAlignVertical="top"
            maxLength={4000}
          />
          {createError ? <Text style={styles.err}>{createError}</Text> : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.light.text, marginTop: 8 },
  emptySub: { textAlign: "center", color: colors.light.mutedForeground, marginBottom: 8 },
  cta: {
    marginTop: 8,
    backgroundColor: colors.flexaGreen,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: "#fff", fontWeight: "800" },
  link: { marginTop: 12, color: colors.flexaGreen, fontWeight: "700" },
  banner: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 6,
  },
  bannerText: { color: "#B91C1C", fontSize: 13 },
  retry: { color: colors.flexaGreen, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 10,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  ref: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  subject: { fontSize: 15, fontWeight: "700", color: colors.light.text },
  preview: { marginTop: 2, fontSize: 13, color: "#64748B" },
  when: { marginTop: 4, fontSize: 11, color: "#94A3B8" },
  unread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.flexaOrange,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  modal: { flex: 1, backgroundColor: colors.light.background, paddingHorizontal: 16 },
  modalBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: "800", color: colors.light.text },
  cancel: { color: "#64748B", fontWeight: "600" },
  send: { color: colors.flexaGreen, fontWeight: "800" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.light.text,
    marginBottom: 10,
  },
  message: { minHeight: 160 },
  err: { color: colors.light.destructive, marginTop: 4 },
});
