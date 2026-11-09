/**
 * Support ticket thread — text/image/video only (no voice).
 */
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { uploadLocalFile } from "@/lib/mediaUpload";
import {
  fetchSupportThread,
  rateSupportThread,
  sendSupportMessage,
  type SupportMessage,
  type SupportThread,
} from "@/lib/supportApi";

export default function SupportTicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const threadId = Number(id);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(threadId)) return;
    try {
      const data = await fetchSupportThread(threadId, { token });
      setThread(data.thread);
      setMessages(data.messages);
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
    void load();
    const poll = setInterval(() => void load(), 12000);
    return () => clearInterval(poll);
  }, [authLoading, token, router, load]);

  const onSend = async () => {
    if (!token || !draft.trim() || sending) return;
    const content = draft.trim();
    setDraft("");
    setSending(true);
    try {
      await sendSupportMessage(threadId, { content, messageType: "text" }, { token });
      await load();
    } catch (e) {
      setDraft(content);
      Alert.alert("Send failed", e instanceof Error ? e.message : "Error");
    } finally {
      setSending(false);
    }
  };

  const onPickImage = async () => {
    if (!token || sending) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setSending(true);
    try {
      const up = await uploadLocalFile(result.assets[0].uri, {
        token,
        contentType: result.assets[0].mimeType || "image/jpeg",
        fileName: result.assets[0].fileName || "support.jpg",
      });
      await sendSupportMessage(
        threadId,
        { content: "", messageType: "image", mediaUrl: up.url },
        { token },
      );
      await load();
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Error");
    } finally {
      setSending(false);
    }
  };

  const onRate = (rating: number) => {
    if (!token) return;
    void rateSupportThread(threadId, rating, { token })
      .then(() => Alert.alert("Thanks", "Your rating was saved."))
      .catch((e) => Alert.alert("Rate", e instanceof Error ? e.message : "Error"));
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/support"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {thread?.subject || "Support ticket"}
          </Text>
          <Text style={styles.sub}>{thread?.status || "open"} · no voice messages</Text>
        </View>
      </View>

      {error && !messages.length ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 12, paddingBottom: 12 }}
          renderItem={({ item }) => {
            const mine = item.senderId === user?.id;
            return (
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                {item.messageType === "image" && item.mediaUrl ? (
                  <Image
                    source={{
                      uri: item.mediaUrl.startsWith("http")
                        ? item.mediaUrl
                        : `https://flexamarket.com${item.mediaUrl}`,
                    }}
                    style={styles.img}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={[styles.text, mine && styles.textMine]}>{item.content}</Text>
                )}
              </View>
            );
          }}
          ListFooterComponent={
            <View style={styles.rateRow}>
              <Text style={styles.rateLabel}>Rate support</Text>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => onRate(n)}>
                  <Feather name="star" size={18} color="#F97316" />
                </Pressable>
              ))}
            </View>
          }
        />
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable style={styles.attach} onPress={() => void onPickImage()}>
          <Feather name="image" size={18} color="#0F172A" />
        </Pressable>
        <View style={[styles.attach, styles.attachDisabled]}>
          <Feather name="mic-off" size={18} color="#94A3B8" />
        </View>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message support…"
          placeholderTextColor="#94A3B8"
          multiline
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
  title: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  sub: { fontSize: 11, color: "#64748B", marginTop: 2 },
  error: { color: "#B91C1C", padding: 16, fontWeight: "600" },
  bubble: {
    maxWidth: "82%",
    borderRadius: 14,
    padding: 10,
    marginVertical: 4,
  },
  mine: { alignSelf: "flex-end", backgroundColor: "#F97316" },
  theirs: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  text: { color: "#0F172A", fontSize: 15 },
  textMine: { color: "#fff" },
  img: { width: 180, height: 180, borderRadius: 10 },
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    justifyContent: "center",
  },
  rateLabel: { color: "#64748B", fontSize: 12, marginRight: 4 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  attach: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 4,
  },
  attachDisabled: { backgroundColor: "#F1F5F9" },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0F172A",
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
