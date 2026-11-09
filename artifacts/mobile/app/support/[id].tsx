import { StateView } from "@/components/StateView";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
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
import { SafeAreaView } from "react-native-safe-area-context";

type SupportMessage = {
  id: number;
  content?: string;
  isAdminReply?: boolean;
  senderRole?: string;
  senderName?: string;
  messageType?: string;
  mediaUrl?: string | null;
  isRead?: boolean;
  createdAt?: string;
};

type ThreadDetail = {
  id: number;
  ticketRef?: string;
  subject?: string;
  status?: string;
  estimatedResponseLabel?: string | null;
  assignedAdminName?: string | null;
  rating?: number | null;
  messages?: SupportMessage[];
};

function makeClientId() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function SupportThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, user } = useAuth();
  useAndroidBack();

  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingBusy, setRatingBusy] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch(`/support/threads/${id}`, { token, auth: true });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Thread failed (${res.status})`);
      setThread(data);
      if (typeof data.rating === "number") setRating(data.rating);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Could not load ticket.");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  async function send() {
    if (!token || !text.trim() || sending) return;
    setSending(true);
    const content = text.trim();
    setText("");
    try {
      const res = await apiFetch(`/support/threads/${id}/messages`, {
        method: "POST",
        token,
        body: JSON.stringify({
          content,
          messageType: "text",
          clientMessageId: makeClientId(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Send failed (${res.status})`);
      await load();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      setError(e?.message || "Send failed.");
      setText(content);
    } finally {
      setSending(false);
    }
  }

  async function submitRating(stars: number) {
    if (!token || ratingBusy) return;
    setRatingBusy(true);
    setRating(stars);
    try {
      const res = await apiFetch(`/support/threads/${id}/rate`, {
        method: "POST",
        token,
        body: JSON.stringify({ rating: stars }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Rating failed");
      }
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not submit rating.");
    } finally {
      setRatingBusy(false);
    }
  }

  if (!token || !user) {
    return (
      <SafeAreaView style={styles.safe}>
        <StateView error="Sign in required." onRetry={() => router.push("/auth/login")} />
      </SafeAreaView>
    );
  }

  const messages = thread?.messages || [];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/support"))}>
          <Feather name="arrow-left" size={20} color="#F8FAFC" />
        </Pressable>
        <View style={{ alignItems: "center", flex: 1 }}>
          <Text style={styles.brand}>#{thread?.ticketRef || id}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {thread?.subject || "Support"}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      {thread?.estimatedResponseLabel || thread?.assignedAdminName ? (
        <Text style={styles.metaLine}>
          {thread.assignedAdminName ? `Agent: ${thread.assignedAdminName}` : "Unassigned"}
          {thread.estimatedResponseLabel ? ` · ETA ${thread.estimatedResponseLabel}` : ""}
          {thread.status ? ` · ${thread.status}` : ""}
        </Text>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        <StateView loading={loading && !thread} error={!thread ? error : null} onRetry={load}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const mine = !item.isAdminReply && item.senderRole !== "bot";
              const media = resolveMediaUrl(item.mediaUrl || null);
              return (
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <Text style={styles.sender}>{item.senderName || (item.senderRole === "bot" ? "FlexaBot" : "Agent")}</Text>
                  {item.messageType === "image" && media ? (
                    <Image source={{ uri: media }} style={styles.media} contentFit="cover" />
                  ) : null}
                  <Text style={styles.body}>{item.content}</Text>
                  <Text style={styles.time}>
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
                  </Text>
                </View>
              );
            }}
          />
        </StateView>

        {thread?.status === "closed" ? (
          <View style={styles.rateBox}>
            <Text style={styles.rateLabel}>Rate this ticket</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => void submitRating(n)} disabled={ratingBusy}>
                  <Feather name="star" size={22} color={n <= rating ? "#F97316" : "#475569"} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Reply…"
              placeholderTextColor="#64748B"
              multiline
            />
            <Pressable style={styles.send} onPress={() => void send()} disabled={sending || !text.trim()}>
              {sending ? <ActivityIndicator color="#fff" /> : <Feather name="send" size={18} color="#fff" />}
            </Pressable>
          </View>
        )}
        <Text style={styles.note}>Voice messages are not supported in support chat.</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 16, fontWeight: "800", color: "#F8FAFC" },
  sub: { fontSize: 11, color: "#94A3B8", maxWidth: 220 },
  metaLine: { color: "#64748B", fontSize: 12, textAlign: "center", marginBottom: 4 },
  list: { padding: 16, paddingBottom: 12 },
  bubble: { maxWidth: "85%", borderRadius: 14, padding: 10, marginBottom: 8 },
  mine: { alignSelf: "flex-end", backgroundColor: "#EA580C" },
  theirs: { alignSelf: "flex-start", backgroundColor: "#1E293B" },
  sender: { color: "#FDBA74", fontSize: 11, fontWeight: "700", marginBottom: 2 },
  body: { color: "#F8FAFC", fontSize: 15, lineHeight: 20 },
  time: { color: "rgba(255,255,255,0.65)", fontSize: 10, marginTop: 4 },
  media: { width: 160, height: 160, borderRadius: 10, marginBottom: 6 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#F8FAFC",
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  rateBox: { padding: 16, alignItems: "center", gap: 8 },
  rateLabel: { color: "#F8FAFC", fontWeight: "700" },
  stars: { flexDirection: "row", gap: 10 },
  note: { color: "#64748B", fontSize: 11, textAlign: "center", paddingBottom: 6 },
});
