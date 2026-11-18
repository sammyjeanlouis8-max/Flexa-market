/**
 * CalcAI — marketplace math assistant.
 * POST /api/calculator/ask  { messages: [{role, content}] } → { content }
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
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
import { apiRequest, ApiError } from "@/lib/request";

type Msg = { id: string; role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "7% commission on a $50 sale?",
  "Delivery moto same commune?",
  "Convert $20 to HTG",
  "Boost budget $10 for 5 days",
];

export default function CalculatorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi — I'm CalcAI. Ask about commissions, delivery fees, currency (≈130 HTG/USD), boosts, transfers, or BNPL math.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Msg>>(null);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending) return;
      if (!token) {
        router.push("/auth/login");
        return;
      }
      setError(null);
      setDraft("");
      const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content };
      const history = [...messages.filter((m) => m.role === "user" || m.id !== "welcome"), userMsg];
      setMessages([...messages, userMsg]);
      setSending(true);
      try {
        const apiMessages = history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .slice(-18)
          .map((m) => ({ role: m.role, content: m.content }));
        const res = await apiRequest<{ content: string }>("/calculator/ask", {
          token,
          method: "POST",
          body: { messages: apiMessages.length ? apiMessages : [{ role: "user", content }] },
        });
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: res.content || "No answer returned.",
          },
        ]);
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Calculator unavailable";
        setError(msg);
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            content: `Sorry — ${msg}`,
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
        <AppHeader title="CalcAI" showBack showCart={false} />
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Sign in to use CalcAI</Text>
          <Pressable style={styles.cta} onPress={() => router.push("/auth/login")}>
            <Text style={styles.ctaText}>Log in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader title="CalcAI" showBack showCart={false} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 12, gap: 10 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === "user" ? styles.userBubble : styles.botBubble,
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  item.role === "user" ? styles.userText : styles.botText,
                ]}
              >
                {item.content}
              </Text>
            </View>
          )}
          ListFooterComponent={
            <>
              {sending ? (
                <View style={styles.typing}>
                  <ActivityIndicator color={colors.flexaGreen} size="small" />
                  <Text style={styles.typingText}>Calculating…</Text>
                </View>
              ) : null}
              {error ? <Text style={styles.err}>{error}</Text> : null}
            </>
          }
        />
        <View style={styles.chips}>
          {SUGGESTIONS.map((s) => (
            <Pressable key={s} style={styles.chip} onPress={() => void send(s)} disabled={sending}>
              <Text style={styles.chipText}>{s}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask a calculation…"
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={2000}
            editable={!sending}
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
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.light.text, marginBottom: 12 },
  cta: {
    backgroundColor: colors.flexaGreen,
    paddingHorizontal: 20,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: "#fff", fontWeight: "800" },
  bubble: { maxWidth: "88%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.flexaGreen },
  botBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  userText: { color: "#fff" },
  botText: { color: colors.light.text },
  typing: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  typingText: { color: colors.light.mutedForeground, fontSize: 13 },
  err: { color: colors.light.destructive, fontSize: 13, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  chip: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.flexaGreen },
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
    backgroundColor: colors.light.background,
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
