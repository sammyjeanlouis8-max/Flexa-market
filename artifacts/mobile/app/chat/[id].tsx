/**
 * Flexa Chat Pro Max — conversation thread
 * GET/POST /api/conversations/:id/messages + Socket.IO realtime + polling fallback.
 */
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  fetchConversations,
  fetchMessages,
  formatMessageTime,
  sendMessage,
  translateMessage,
  uploadChatImage,
  type ChatMessage,
  type Conversation,
} from "@/lib/chatApi";
import {
  emitStopTyping,
  emitTyping,
  getChatSocket,
  joinConversation,
  leaveConversation,
  onNewMessage,
  onStopTyping,
  onTyping,
  presenceJoin,
} from "@/lib/chatSocket";

function mediaUri(msg: ChatMessage): string | null {
  const raw = msg.imageUrl || msg.mediaUrl;
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  if (raw.startsWith("/")) return `https://flexamarket.com${raw}`;
  return raw;
}

export default function ChatThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = Number(id);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { lang } = useLanguage();

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [meta, setMeta] = useState<Conversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [translations, setTranslations] = useState<Record<number, string>>({});
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMeta = useCallback(async () => {
    if (!token || !Number.isFinite(convId)) return;
    try {
      const list = await fetchConversations({ token });
      setMeta(list.find((c) => c.id === convId) ?? null);
    } catch {
      /* thread still usable without header meta */
    }
  }, [token, convId]);

  const loadMessages = useCallback(
    async (mode: "initial" | "silent" = "initial") => {
      if (!token || !Number.isFinite(convId)) return;
      if (mode === "initial") setError(null);
      try {
        const rows = await fetchMessages(convId, { token });
        setMessages(rows);
        setError(null);
      } catch (e) {
        if (mode === "initial") {
          setError(e instanceof Error ? e.message : "Could not load chat");
          setMessages((prev) => prev ?? []);
        }
      }
    },
    [token, convId],
  );

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace("/auth/login");
      return;
    }
    if (!token || !Number.isFinite(convId)) return;

    void loadMeta();
    void loadMessages("initial");
    if (user?.id) presenceJoin(user.id);
    getChatSocket().connect();
    joinConversation(convId);

    const offNew = onNewMessage((msg) => {
      if (Number(msg?.conversationId) !== convId) return;
      setMessages((prev) => {
        const list = prev ?? [];
        if (list.some((m) => m.id === msg.id)) return list;
        if (
          msg.clientMessageId &&
          list.some((m) => m.clientMessageId === msg.clientMessageId)
        ) {
          return list.map((m) =>
            m.clientMessageId === msg.clientMessageId ? { ...m, ...msg } : m,
          );
        }
        return [...list, msg as ChatMessage];
      });
    });

    const offTyping = onTyping((data) => {
      if (data.convId !== convId) return;
      if (user?.id && data.userId === user.id) return;
      setPeerTyping(true);
    });
    const offStop = onStopTyping((data) => {
      if (data.convId !== convId) return;
      setPeerTyping(false);
    });

    const poll = setInterval(() => {
      void loadMessages("silent");
    }, 12000);

    return () => {
      leaveConversation(convId);
      offNew();
      offTyping();
      offStop();
      clearInterval(poll);
      if (user?.id) emitStopTyping(convId, user.id);
    };
  }, [authLoading, token, user?.id, convId, router, loadMeta, loadMessages]);

  useEffect(() => {
    if (!messages?.length) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages?.length, peerTyping]);

  const onChangeDraft = (text: string) => {
    setDraft(text);
    if (!user?.id || !Number.isFinite(convId)) return;
    emitTyping(convId, user.id);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      emitStopTyping(convId, user.id);
    }, 1200);
  };

  const onSend = async () => {
    if (!token || !user || !Number.isFinite(convId)) return;
    const content = draft.trim();
    if (!content || sending) return;
    const clientMessageId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: ChatMessage = {
      id: -Date.now(),
      conversationId: convId,
      senderId: user.id,
      senderName: user.name,
      senderAvatar: user.avatarUrl ?? null,
      content,
      messageType: "text",
      mediaUrl: null,
      imageUrl: null,
      isRead: false,
      clientMessageId,
      createdAt: new Date().toISOString(),
    };
    setDraft("");
    setMessages((prev) => [...(prev ?? []), optimistic]);
    setSending(true);
    emitStopTyping(convId, user.id);
    try {
      const saved = await sendMessage(
        convId,
        { content, messageType: "text", clientMessageId },
        { token },
      );
      setMessages((prev) =>
        (prev ?? []).map((m) =>
          m.clientMessageId === clientMessageId ? saved : m,
        ),
      );
    } catch (e) {
      setMessages((prev) =>
        (prev ?? []).filter((m) => m.clientMessageId !== clientMessageId),
      );
      setDraft(content);
      Alert.alert("Send failed", e instanceof Error ? e.message : "Could not send");
    } finally {
      setSending(false);
    }
  };

  const onPickImage = async () => {
    if (!token || !user || !Number.isFinite(convId) || sending) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to send images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setSending(true);
    try {
      const url = await uploadChatImage(asset.uri, {
        token,
        contentType: asset.mimeType || "image/jpeg",
        fileName: asset.fileName || "chat.jpg",
      });
      const clientMessageId = `i-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const saved = await sendMessage(
        convId,
        {
          content: "",
          messageType: "image",
          imageUrl: url,
          mediaUrl: url,
          clientMessageId,
        },
        { token },
      );
      setMessages((prev) => {
        const list = prev ?? [];
        if (list.some((m) => m.id === saved.id)) return list;
        return [...list, saved];
      });
    } catch (e) {
      Alert.alert("Image failed", e instanceof Error ? e.message : "Could not send image");
    } finally {
      setSending(false);
    }
  };

  const onTranslate = async (msg: ChatMessage) => {
    if (!token || !msg.content?.trim()) return;
    if (translations[msg.id]) {
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[msg.id];
        return next;
      });
      return;
    }
    const result = await translateMessage(msg.id, lang, { token });
    if (!result) {
      Alert.alert("Translate", "Translation is unavailable right now.");
      return;
    }
    setTranslations((prev) => ({ ...prev, [msg.id]: result.translatedText }));
  };

  const myId = user?.id;
  const title = meta?.otherUserName || "Chat";
  const subtitle = meta?.listingTitle;

  const data = useMemo(() => messages ?? [], [messages]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/(tabs)/inbox")
          }
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <View style={styles.headerMeta}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {meta?.listingId ? (
          <Pressable
            style={styles.back}
            onPress={() => router.push(`/listing/${meta.listingId}`)}
          >
            <Feather name="shopping-bag" size={18} color="#0F172A" />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {messages === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : error && !messages?.length ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => void loadMessages("initial")}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: 12,
            flexGrow: 1,
            justifyContent: "flex-end",
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>Say hello — this chat is empty.</Text>
          }
          ListFooterComponent={
            peerTyping ? (
              <Text style={styles.typing}>typing…</Text>
            ) : (
              <View style={{ height: 4 }} />
            )
          }
          renderItem={({ item }) => {
            const mine = item.senderId === myId;
            const img = item.messageType === "image" ? mediaUri(item) : null;
            const deleted = item.isDeleted;
            return (
              <View style={[styles.bubbleWrap, mine ? styles.mine : styles.theirs]}>
                <Pressable
                  onLongPress={() => {
                    if (!mine && item.messageType === "text" && item.content) {
                      void onTranslate(item);
                    }
                  }}
                  style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
                >
                  {deleted ? (
                    <Text style={styles.deleted}>Message deleted</Text>
                  ) : img ? (
                    <Image source={{ uri: img }} style={styles.msgImage} contentFit="cover" />
                  ) : (
                    <Text style={[styles.msgText, mine && styles.msgTextMine]}>
                      {item.content ||
                        (item.messageType === "audio"
                          ? "🎤 Voice message"
                          : item.messageType === "video"
                            ? "🎥 Video"
                            : "")}
                    </Text>
                  )}
                  {translations[item.id] ? (
                    <Text style={styles.translated}>{translations[item.id]}</Text>
                  ) : null}
                  <Text style={[styles.msgTime, mine && styles.msgTimeMine]}>
                    {formatMessageTime(item.createdAt)}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable style={styles.attach} onPress={() => void onPickImage()} disabled={sending}>
          <Feather name="image" size={20} color="#0F172A" />
        </Pressable>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={onChangeDraft}
          placeholder="Type a message"
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={4000}
        />
        <Pressable
          style={[styles.send, (!draft.trim() || sending) && styles.sendDisabled]}
          onPress={() => void onSend()}
          disabled={!draft.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Feather name="send" size={18} color="#fff" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1F5F9" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerMeta: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  subtitle: { fontSize: 12, color: "#F97316", fontWeight: "600", marginTop: 1 },
  centered: { alignItems: "center", paddingTop: 48, gap: 12 },
  error: { color: "#B91C1C", fontWeight: "600" },
  retry: {
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontWeight: "800" },
  empty: { textAlign: "center", color: "#94A3B8", marginVertical: 24 },
  typing: {
    alignSelf: "flex-start",
    color: "#64748B",
    fontSize: 12,
    fontStyle: "italic",
    marginLeft: 8,
    marginBottom: 4,
  },
  bubbleWrap: { marginVertical: 4, maxWidth: "82%" },
  mine: { alignSelf: "flex-end" },
  theirs: { alignSelf: "flex-start" },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  bubbleMine: { backgroundColor: "#F97316", borderBottomRightRadius: 4 },
  bubbleTheirs: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  msgText: { color: "#0F172A", fontSize: 15, lineHeight: 21 },
  msgTextMine: { color: "#FFFFFF" },
  deleted: { color: "#94A3B8", fontStyle: "italic", fontSize: 13 },
  translated: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148,163,184,0.5)",
    fontSize: 13,
    color: "#334155",
    fontStyle: "italic",
  },
  msgImage: { width: 220, height: 220, borderRadius: 12 },
  msgTime: {
    alignSelf: "flex-end",
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 4,
  },
  msgTimeMine: { color: "rgba(255,255,255,0.8)" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  attach: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 2,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#0F172A",
    fontSize: 15,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendDisabled: { backgroundColor: "#FDBA74" },
});
