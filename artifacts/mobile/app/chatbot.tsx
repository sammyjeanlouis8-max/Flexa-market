import { StateView } from "@/components/StateView";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
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

type Turn = { role: "user" | "assistant"; content: string };

export default function ChatbotScreen() {
  const { token, user } = useAuth();
  useAndroidBack();
  const [messages, setMessages] = useState<Turn[]>([
    {
      role: "assistant",
      content: "Hi — I'm FlexaBot. Ask about orders, shipping, or account help. I can also help you open a support ticket.",
    },
  ]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!token || !text.trim() || sending) return;
    const content = text.trim();
    setText("");
    const next: Turn[] = [...messages, { role: "user", content }];
    setMessages(next);
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch("/chatbot/message", {
        method: "POST",
        token,
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data.content) {
        throw new Error(data.error || `Chatbot failed (${res.status})`);
      }
      const reply = typeof data.content === "string" ? data.content : "Sorry, I could not answer that.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      if (data.escalateSuggested) {
        // Preserve existing escalation path into support tickets.
      }
    } catch (e: any) {
      setError(e?.message || "Chatbot unavailable.");
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
        <Pressable style={styles.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/support"))}>
          <Feather name="arrow-left" size={20} color="#F8FAFC" />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.brand}>Flexa Market</Text>
          <Text style={styles.title}>FlexaBot</Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={() => router.push("/support")}>
          <Feather name="life-buoy" size={18} color="#F97316" />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === "user" ? styles.mine : styles.theirs]}>
              <Text style={styles.body}>{item.content}</Text>
            </View>
          )}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.escalate} onPress={() => router.push("/support")}>
          <Text style={styles.escalateText}>Open a support ticket</Text>
        </Pressable>
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Ask FlexaBot…"
            placeholderTextColor="#64748B"
            multiline
          />
          <Pressable style={styles.send} onPress={() => void send()} disabled={sending || !text.trim()}>
            {sending ? <ActivityIndicator color="#fff" /> : <Feather name="send" size={18} color="#fff" />}
          </Pressable>
        </View>
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
  title: { fontSize: 12, fontWeight: "700", color: "#F97316" },
  list: { padding: 16 },
  bubble: { maxWidth: "88%", borderRadius: 14, padding: 10, marginBottom: 8 },
  mine: { alignSelf: "flex-end", backgroundColor: "#EA580C" },
  theirs: { alignSelf: "flex-start", backgroundColor: "#1E293B" },
  body: { color: "#F8FAFC", fontSize: 15, lineHeight: 21 },
  error: { color: "#FCA5A5", textAlign: "center", paddingHorizontal: 12 },
  escalate: { alignSelf: "center", marginBottom: 6 },
  escalateText: { color: "#F97316", fontWeight: "700", fontSize: 13 },
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
});
