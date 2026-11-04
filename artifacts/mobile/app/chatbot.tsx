import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { SignInGate } from "@/components/SignInGate";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/apiFetch";

type ChatTurn = { role: "user" | "assistant"; text: string };

export default function ChatbotScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const [status, setStatus] = useState<string>("unknown");
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiFetch<{ enabled?: boolean; status?: string }>("/chatbot/status");
      setStatus(data.status || (data.enabled ? "online" : "offline"));
    } catch {
      setStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const send = async () => {
    const message = draft.trim();
    if (!message || !token) return;
    setDraft("");
    setTurns((prev) => [...prev, { role: "user", text: message }]);
    setBusy(true);
    try {
      const res = await apiFetch<{ reply?: string; message?: string }>("/chatbot/message", {
        token,
        method: "POST",
        body: { message },
      });
      setTurns((prev) => [
        ...prev,
        { role: "assistant", text: res.reply || res.message || "No reply." },
      ]);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          text: err instanceof Error ? err.message : "Chatbot error",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.mutedForeground }}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Support chatbot</Text>
        <Text style={{ color: colors.mutedForeground }}>Status: {status}</Text>
      </View>

      {!token ? (
        <View style={styles.pad}>
          <SignInGate message="Sign in to chat with support." />
        </View>
      ) : (
        <>
          <FlatList
            data={turns}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>
                Ask Flexa support a question.
              </Text>
            }
            renderItem={({ item }) => (
              <View
                style={[
                  styles.bubble,
                  {
                    alignSelf: item.role === "user" ? "flex-end" : "flex-start",
                    backgroundColor: item.role === "user" ? colors.primary : "#1E293B",
                  },
                ]}
              >
                <Text style={{ color: item.role === "user" ? "#0F172A" : colors.foreground }}>
                  {item.text}
                </Text>
              </View>
            )}
          />
          <View style={[styles.composer, { borderColor: colors.border }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground }]}
            />
            <Pressable
              onPress={() => void send()}
              disabled={busy || !draft.trim()}
              style={[
                styles.send,
                {
                  backgroundColor: colors.primary,
                  opacity: busy || !draft.trim() ? 0.5 : 1,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#0F172A" />
              ) : (
                <Text style={styles.sendText}>Send</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, gap: 4 },
  title: { fontSize: 28, fontWeight: "700" },
  pad: { padding: 20 },
  list: { padding: 16, gap: 8, flexGrow: 1 },
  bubble: {
    maxWidth: "80%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginVertical: 4,
  },
  composer: {
    flexDirection: "row",
    gap: 8,
    borderTopWidth: 1,
    padding: 12,
    alignItems: "center",
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 8 },
  send: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  sendText: { color: "#0F172A", fontWeight: "700" },
});
