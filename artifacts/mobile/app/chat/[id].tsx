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
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface ChatMessage {
  id: number;
  senderId: number;
  content: string;
  messageType: string;
  mediaUrl?: string;
  imageUrl?: string;
  isRead: boolean;
  createdAt: string;
}

interface ConvDetail {
  id: number;
  otherUser?: { id: number; name: string; avatarUrl?: string };
  listing?: { id: number; title: string; images?: string[] };
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function lastSeenLabel(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "";
  const diff = Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 1000);
  if (diff < 60) return "li te la kounye a";
  if (diff < 3600) return `li te la ${Math.floor(diff / 60)} min pase`;
  if (diff < 86400) return `li te la ${Math.floor(diff / 3600)}h pase`;
  return `li te la ${Math.floor(diff / 86400)} jou pase`;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const { user } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conv, setConv] = useState<ConvDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [otherOnline, setOtherOnline] = useState<boolean | null>(null);
  const [otherLastSeen, setOtherLastSeen] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presencePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async (silent = false) => {
    if (!id) return;
    try {
      const data = await request<{ messages?: ChatMessage[] } | ChatMessage[]>(
        `/conversations/${id}/messages?limit=100`
      );
      const msgs = Array.isArray(data)
        ? data
        : ((data as any).messages ?? []);
      setMessages(msgs);
      if (!silent) setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
    } catch {
      // ignore
    }
  }, [id, request]);

  const fetchConv = useCallback(async () => {
    if (!id) return;
    try {
      const convs = await request<ConvDetail[]>("/conversations");
      const found = convs.find((c: ConvDetail) => String(c.id) === String(id));
      if (found) setConv(found);
    } catch {
      // ignore
    }
  }, [id, request]);

  const fetchPresence = useCallback(async (otherUserId: number) => {
    try {
      const data = await request<{ isOnline: boolean; lastSeenAt: string | null }>(
        `/users/${otherUserId}/presence`
      );
      setOtherOnline(data.isOnline);
      setOtherLastSeen(data.lastSeenAt);
    } catch {
      // ignore
    }
  }, [request]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchConv(), fetchMessages()]).finally(() => setLoading(false));
    pollRef.current = setInterval(() => fetchMessages(true), 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (presencePollRef.current) clearInterval(presencePollRef.current);
    };
  }, [fetchConv, fetchMessages]);

  useEffect(() => {
    if (!conv?.otherUser?.id) return;
    const otherId = conv.otherUser.id;
    fetchPresence(otherId);
    presencePollRef.current = setInterval(() => fetchPresence(otherId), 20000);
    return () => { if (presencePollRef.current) clearInterval(presencePollRef.current); };
  }, [conv?.otherUser?.id, fetchPresence]);

  async function handleSend() {
    if (!text.trim() || !id || sending) return;
    const draft = text.trim();
    setText("");
    setSending(true);
    try {
      await request(`/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft, messageType: "text" }),
      });
      await fetchMessages(true);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    } catch {
      setText(draft);
    } finally {
      setSending(false);
    }
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const myId = user?.id;

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const otherName = conv?.otherUser?.name ?? "Itilizatè";
  const avatar = conv?.otherUser?.avatarUrl;
  const listingTitle = conv?.listing?.title;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.avatarWrap}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.headerAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.headerAvatarFallback, { backgroundColor: colors.primary }]}>
                <Text style={styles.initials}>{otherName.slice(0, 2).toUpperCase()}</Text>
              </View>
            )}
            {otherOnline !== null && (
              <View style={[
                styles.presenceDot,
                { backgroundColor: otherOnline ? "#22C55E" : "#9CA3AF", borderColor: colors.card }
              ]} />
            )}
          </View>
          <View style={styles.headerNames}>
            <Text style={[styles.headerName, { color: colors.foreground }]} numberOfLines={1}>{otherName}</Text>
            {otherOnline === true ? (
              <Text style={[styles.headerSub, { color: "#22C55E" }]}>Online</Text>
            ) : otherOnline === false && otherLastSeen ? (
              <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{lastSeenLabel(otherLastSeen)}</Text>
            ) : listingTitle ? (
              <Text style={[styles.headerSub, { color: colors.primary }]} numberOfLines={1}>{listingTitle}</Text>
            ) : null}
          </View>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Listing thumbnail strip */}
      {conv?.listing?.images?.[0] && (
        <Pressable
          onPress={() => router.push(`/listing/${conv.listing!.id}`)}
          style={[styles.listingStrip, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
        >
          <Image source={{ uri: conv.listing.images[0] }} style={styles.listingThumb} contentFit="cover" />
          <Text style={[styles.listingTitle, { color: colors.foreground }]} numberOfLines={1}>{listingTitle}</Text>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </Pressable>
      )}

      {/* Messages list */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.msgList, { paddingBottom: 12 }]}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const isMine = item.senderId === myId;
          return (
            <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
              {item.messageType === "image" && (item.imageUrl || item.mediaUrl) ? (
                <Image
                  source={{ uri: item.imageUrl ?? item.mediaUrl }}
                  style={styles.msgImage}
                  contentFit="cover"
                />
              ) : (
                <View style={[
                  styles.bubble,
                  isMine
                    ? [styles.bubbleMine, { backgroundColor: colors.primary }]
                    : [styles.bubbleTheirs, { backgroundColor: colors.card, borderColor: colors.border }]
                ]}>
                  <Text style={[styles.bubbleText, { color: isMine ? "#FFF" : colors.foreground }]}>
                    {item.content}
                  </Text>
                </View>
              )}
              <Text style={[styles.msgTime, { color: colors.mutedForeground }, isMine ? styles.timeRight : styles.timeLeft]}>
                {timeLabel(item.createdAt)}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Feather name="message-circle" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyChatText, { color: colors.mutedForeground }]}>
              Kòmanse konvèsasyon an
            </Text>
          </View>
        }
      />

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8, backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
          placeholder="Ekri yon mesaj…"
          placeholderTextColor={colors.mutedForeground}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.border }]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Feather name="send" size={18} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12,
    paddingBottom: 12, borderBottomWidth: 1, gap: 8,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  avatarWrap: { position: "relative", width: 38, height: 38 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19 },
  headerAvatarFallback: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  presenceDot: {
    position: "absolute", bottom: 0, right: 0,
    width: 11, height: 11, borderRadius: 6, borderWidth: 2,
  },
  initials: { color: "#FFF", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  headerNames: { flex: 1 },
  headerName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  listingStrip: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 14,
    paddingVertical: 8, borderBottomWidth: 1, gap: 10,
  },
  listingThumb: { width: 36, height: 36, borderRadius: 6 },
  listingTitle: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  msgList: { padding: 12, gap: 4, flexGrow: 1 },
  msgRow: { marginVertical: 3, maxWidth: "80%" },
  msgRowRight: { alignSelf: "flex-end", alignItems: "flex-end" },
  msgRowLeft: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleTheirs: { borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  msgImage: { width: 200, height: 200, borderRadius: 12 },
  msgTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, marginHorizontal: 4 },
  timeRight: { textAlign: "right" },
  timeLeft: { textAlign: "left" },
  emptyChat: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyChatText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12,
    paddingTop: 10, borderTopWidth: 1, gap: 8,
  },
  input: {
    flex: 1, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16,
    paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular",
    maxHeight: 120, minHeight: 44,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
  },
});
