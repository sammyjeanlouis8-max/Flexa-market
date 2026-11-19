/**
 * FlexaBot — POST /api/chatbot/message
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/request";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  deepLinks?: string[];
};

export default function ChatbotScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "hi",
      role: "assistant",
      content:
        "Hi — I'm FlexaBot. I can help with orders, wallet, delivery, and account questions. For account changes I'll point you to Support.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const listRef = useRef<FlatList<Msg>>(null);

  useEffect(() => {
    apiRequest<{ configured?: boolean; mode?: string }>("/chatbot/status")
      .then((s) => setStatus(s.configured ? "Online" : "Limited"))
      .catch(() => setStatus("Unavailable"));
  }, []);

  const openLink = (path: string) => {
    if (path.startsWith("http")) {
      Linking.openURL(path).catch(() => {});
      return;
    }
    router.push(path as any);
  };

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending) return;
      if (!token) {
        router.push("/auth/login");
        return;
      }
      setDraft("");
      const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content };
      setMessages((prev) => [...prev, userMsg]);
      setSending(true);
      try {
        const history = [...messages.filter((m) => m.id !== "hi"), userMsg]
          .slice(-16)
          .map((m) => ({ role: m.role, content: m.content }));
        const res = await apiRequest<{
          content?: string;
          deepLinks?: string[];
          escalateSuggested?: boolean;
        }>("/chatbot/message", {
          token,
          method: "POST",
          body: { messages: history },
        });
        const links = Array.isArray(res.deepLinks) ? res.deepLinks : [];
        if (res.escalateSuggested && !links.includes("/support")) links.push("/support");
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: res.content || "I couldn't find a verified answer. Try Support.",
            deepLinks: links,
          },
        ]);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            content: e instanceof Error ? e.message : "FlexaBot is unavailable right now.",
            deepLinks: ["/support"],
          },
        ]);
      } finally {
        setSending(false);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      }
    },
    [messages, sending, token, router],
  );

  if (!authLoading && !token) {
    return (
      <View style={styles.root}>
        <AppHeader title="FlexaBot" showBack showCart={false} />
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Sign in to chat with FlexaBot</Text>
          <Pressable style={styles.cta} onPress={() => router.push("/auth/login")}>
            <Text style={styles.ctaText}>Log in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title="FlexaBot"
        showBack
        showCart={false}
        rightExtra={
          status ? (
            <Text style={styles.status}>{status}</Text>
          ) : null
        }
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === "user" ? styles.user : styles.bot,
              ]}
            >
              <Text
                style={[
                  styles.text,
                  item.role === "user" ? { color: "#fff" } : { color: colors.light.text },
                ]}
              >
                {item.content}
              </Text>
              {item.deepLinks?.length ? (
                <View style={styles.links}>
                  {item.deepLinks.map((l) => (
                    <Pressable key={l} style={styles.linkChip} onPress={() => openLink(l)}>
                      <Text style={styles.linkText}>{l}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          )}
          ListFooterComponent={
            sending ? (
              <View style={styles.typing}>
                <ActivityIndicator color={colors.flexaGreen} size="small" />
                <Text style={styles.typingText}>Thinking…</Text>
              </View>
            ) : null
          }
        />
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask FlexaBot…"
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={2000}
          />
          <Pressable
            style={[styles.send, (!draft.trim() || sending) && { opacity: 0.5 }]}
            onPress={() => void send(draft)}
            disabled={!draft.trim() || sending}
          >
            <Feather name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { fontWeight: "700", marginBottom: 12, color: colors.light.text },
  cta: {
    backgroundColor: colors.flexaGreen,
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: "#fff", fontWeight: "800" },
  status: { color: "#fff", fontSize: 11, fontWeight: "700", marginRight: 4 },
  bubble: { maxWidth: "90%", borderRadius: 16, padding: 12 },
  user: { alignSelf: "flex-end", backgroundColor: colors.flexaGreen },
  bot: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  text: { fontSize: 15, lineHeight: 22 },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  linkChip: {
    backgroundColor: "#ECFDF5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  linkText: { color: colors.flexaGreen, fontSize: 12, fontWeight: "700" },
  typing: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  typingText: { color: "#64748B", fontSize: 13 },
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
});
