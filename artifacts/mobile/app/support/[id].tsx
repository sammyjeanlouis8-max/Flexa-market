/**
 * Support ticket thread — GET/POST /api/support/threads/:id
 */
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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

type Message = {
  id: number;
  content: string;
  isAdminReply: boolean;
  senderRole?: string;
  senderName?: string;
  createdAt: string;
};

type Thread = {
  id: number;
  ticketRef?: string;
  subject: string;
  status: string;
  messages: Message[];
};

export default function SupportThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const threadId = Number(id);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(threadId)) return;
    try {
      const data = await apiRequest<Thread>(`/support/threads/${threadId}`, { token });
      setThread(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load ticket");
    }
  }, [token, threadId]);

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace("/auth/login");
      return;
    }
    if (token) void load();
  }, [authLoading, token, router, load]);

  const send = async () => {
    if (!token || !draft.trim() || sending) return;
    setSending(true);
    try {
      await apiRequest(`/support/threads/${threadId}/messages`, {
        token,
        method: "POST",
        body: { content: draft.trim() },
      });
      setDraft("");
      await load();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const reopen = async () => {
    if (!token) return;
    try {
      await apiRequest(`/support/threads/${threadId}/reopen`, { token, method: "POST", body: {} });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reopen");
    }
  };

  if (!thread && !error) {
    return (
      <View style={styles.root}>
        <AppHeader title="Ticket" showBack showCart={false} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title={thread ? `#${thread.ticketRef || thread.id}` : "Ticket"}
        showBack
        showCart={false}
      />
      {thread ? (
        <View style={styles.meta}>
          <Text style={styles.subject} numberOfLines={2}>
            {thread.subject}
          </Text>
          <Text style={styles.status}>{thread.status.replace(/_/g, " ")}</Text>
        </View>
      ) : null}
      {error ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{error}</Text>
          <Pressable onPress={() => void load()}>
            <Text style={styles.retry}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          ref={listRef}
          data={thread?.messages ?? []}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <Text style={styles.empty}>No messages in this ticket yet.</Text>
          }
          renderItem={({ item }) => {
            const mine = !item.isAdminReply && item.senderRole !== "bot";
            return (
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                {!mine ? (
                  <Text style={styles.sender}>
                    {item.senderRole === "bot" ? "FlexaBot" : item.senderName || "Support"}
                  </Text>
                ) : null}
                <Text style={[styles.body, mine && { color: "#fff" }]}>{item.content}</Text>
                <Text style={[styles.time, mine && { color: "rgba(255,255,255,0.7)" }]}>
                  {formatWhen(item.createdAt)}
                </Text>
              </View>
            );
          }}
        />
        {thread?.status === "closed" ? (
          <View style={[styles.closedBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Text style={styles.closedText}>This ticket is closed.</Text>
            <Pressable style={styles.reopen} onPress={() => void reopen()}>
              <Text style={styles.reopenText}>Reopen</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Reply…"
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={4000}
            />
            <Pressable
              style={[styles.send, (!draft.trim() || sending) && { opacity: 0.5 }]}
              onPress={() => void send()}
              disabled={!draft.trim() || sending}
            >
              <Feather name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  meta: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.light.border,
  },
  subject: { fontSize: 15, fontWeight: "700", color: colors.light.text },
  status: { marginTop: 2, fontSize: 12, color: "#64748B", textTransform: "capitalize" },
  banner: {
    margin: 12,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  bannerText: { color: "#B91C1C", fontSize: 13 },
  retry: { color: colors.flexaGreen, fontWeight: "700" },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 40 },
  bubble: { maxWidth: "88%", borderRadius: 14, padding: 12 },
  mine: { alignSelf: "flex-end", backgroundColor: colors.flexaGreen },
  theirs: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  sender: { fontSize: 11, fontWeight: "700", color: colors.flexaGreen, marginBottom: 4 },
  body: { fontSize: 15, lineHeight: 21, color: colors.light.text },
  time: { marginTop: 6, fontSize: 10, color: "#94A3B8" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.light.border,
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.light.text,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  closedBar: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: colors.light.border,
    backgroundColor: "#fff",
    alignItems: "center",
    gap: 8,
  },
  closedText: { color: "#64748B" },
  reopen: {
    backgroundColor: colors.flexaGreen,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  reopenText: { color: "#fff", fontWeight: "800" },
});
