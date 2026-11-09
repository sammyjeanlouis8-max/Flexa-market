import { StateView } from "@/components/StateView";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { uploadListingImage } from "@/lib/imageUpload";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { usePhotoPicker } from "@/hooks/usePhotoPicker";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ChatMessage = {
  id: number;
  senderId: number;
  senderName?: string;
  content?: string;
  messageType?: string;
  mediaUrl?: string | null;
  imageUrl?: string | null;
  isRead?: boolean;
  isDeleted?: boolean;
  createdAt?: string;
  clientMessageId?: string | null;
};

function makeClientId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, user } = useAuth();
  const { pickImages } = usePhotoPicker();
  useAndroidBack();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  const seenIds = useRef<Set<number>>(new Set());

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch(`/conversations/${id}/messages`, { token, auth: true });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.error || `Messages failed (${res.status})`);
      const rows: ChatMessage[] = Array.isArray(data) ? data : [];
      // Deduplicate by id (retry / poll safety).
      const unique: ChatMessage[] = [];
      const ids = new Set<number>();
      for (const m of rows) {
        if (!m?.id || ids.has(m.id)) continue;
        ids.add(m.id);
        unique.push(m);
      }
      seenIds.current = ids;
      setMessages(unique);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Could not load chat.");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [load]);

  async function sendText() {
    if (!token || !text.trim() || sending) return;
    setSending(true);
    const content = text.trim();
    const clientMessageId = makeClientId();
    setText("");
    try {
      const res = await apiFetch(`/conversations/${id}/messages`, {
        method: "POST",
        token,
        body: JSON.stringify({
          content,
          messageType: "text",
          clientMessageId,
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

  async function sendImage() {
    if (!token || sending) return;
    const picked = await pickImages(0);
    if (!picked[0]) return;
    setSending(true);
    try {
      // Reuse existing Wasabi upload path (same as listings).
      const remoteUrl = await uploadListingImage(picked[0], token);
      const res = await apiFetch(`/conversations/${id}/messages`, {
        method: "POST",
        token,
        body: JSON.stringify({
          content: "",
          messageType: "image",
          mediaUrl: remoteUrl,
          imageUrl: remoteUrl,
          clientMessageId: makeClientId(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Image send failed (${res.status})`);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not send image.");
    } finally {
      setSending(false);
    }
  }

  if (!token || !user) {
    return (
      <SafeAreaView style={styles.safe}>
        <StateView error="Sign in required." onRetry={() => router.push("/auth/login")} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/inbox"))}>
          <Feather name="arrow-left" size={20} color="#F8FAFC" />
        </Pressable>
        <Text style={styles.brand}>Flexa Market</Text>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        <StateView loading={loading && messages.length === 0} error={messages.length === 0 ? error : null} onRetry={load}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const mine = item.senderId === user.id;
              if (item.isDeleted) {
                return (
                  <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                    <Text style={styles.deleted}>Message deleted</Text>
                  </View>
                );
              }
              const media = resolveMediaUrl(item.mediaUrl || item.imageUrl || null);
              return (
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  {!mine ? <Text style={styles.sender}>{item.senderName}</Text> : null}
                  {item.messageType === "image" && media ? (
                    <Image source={{ uri: media }} style={styles.media} contentFit="cover" />
                  ) : null}
                  {item.messageType === "video" && media ? (
                    <Pressable onPress={() => void Linking.openURL(media)}>
                      <Text style={styles.body}>Open video attachment</Text>
                    </Pressable>
                  ) : null}
                  {item.messageType === "audio" ? (
                    <Text style={styles.body}>Voice message (playback not available on Android native)</Text>
                  ) : null}
                  {item.content && item.messageType !== "audio" ? (
                    <Text style={styles.body}>{item.content}</Text>
                  ) : null}
                  <Text style={styles.time}>
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
                    {mine && item.isRead ? " · Read" : ""}
                  </Text>
                </View>
              );
            }}
          />
        </StateView>

        {error && messages.length > 0 ? <Text style={styles.inlineError}>{error}</Text> : null}

        <View style={styles.composer}>
          <Pressable style={styles.attach} onPress={() => void sendImage()} disabled={sending}>
            <Feather name="image" size={20} color="#F97316" />
          </Pressable>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor="#64748B"
            multiline
          />
          <Pressable style={styles.send} onPress={() => void sendText()} disabled={sending || !text.trim()}>
            {sending ? <ActivityIndicator color="#fff" /> : <Feather name="send" size={18} color="#fff" />}
          </Pressable>
        </View>
        <Text style={styles.note}>Voice messages are not available in the native Android app.</Text>
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
  list: { padding: 16, paddingBottom: 12 },
  bubble: {
    maxWidth: "82%",
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
  },
  mine: { alignSelf: "flex-end", backgroundColor: "#EA580C" },
  theirs: { alignSelf: "flex-start", backgroundColor: "#1E293B" },
  sender: { color: "#FDBA74", fontSize: 11, marginBottom: 2, fontWeight: "700" },
  body: { color: "#F8FAFC", fontSize: 15, lineHeight: 20 },
  deleted: { color: "#94A3B8", fontStyle: "italic" },
  time: { color: "rgba(255,255,255,0.7)", fontSize: 10, marginTop: 4 },
  media: { width: 180, height: 180, borderRadius: 10, marginBottom: 6 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
  },
  attach: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
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
  note: { color: "#64748B", fontSize: 11, textAlign: "center", paddingBottom: 6 },
  inlineError: { color: "#FCA5A5", textAlign: "center", paddingHorizontal: 12 },
});
