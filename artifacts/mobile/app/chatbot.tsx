/**
 * FlexaBot — POST /api/chatbot/message (text only).
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { sendChatbotMessage } from "@/lib/supportApi";

type Row = { id: string; role: "user" | "bot"; content: string };

export default function ChatbotScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const { lang } = useLanguage();
  const [rows, setRows] = useState<Row[]>([
    {
      id: "welcome",
      role: "bot",
      content: "Hi — I’m FlexaBot. Ask about orders, delivery, payments, or account help.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const onSend = async () => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    const content = draft.trim();
    if (!content || busy) return;
    setDraft("");
    const userRow: Row = { id: `u-${Date.now()}`, role: "user", content };
    setRows((prev) => [...prev, userRow]);
    setBusy(true);
    try {
      const history = [...rows, userRow]
        .filter((r) => r.role === "user" || r.role === "bot")
        .map((r) => ({
          role: r.role === "bot" ? "assistant" : "user",
          content: r.content,
        }));
      const data = await sendChatbotMessage(history, {
        token,
        preferredLang: lang,
      });
      const reply =
        (typeof data.reply === "string" && data.reply) ||
        (typeof data.message === "string" && data.message) ||
        (typeof (data as any).content === "string" && (data as any).content) ||
        "I couldn’t answer that right now. Open a support ticket for a human agent.";
      setRows((prev) => [
        ...prev,
        { id: `b-${Date.now()}`, role: "bot", content: reply },
      ]);
    } catch (e) {
      setRows((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "bot",
          content: e instanceof Error ? e.message : "FlexaBot unavailable",
        },
      ]);
    } finally {
      setBusy(false);
    }
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
        <Text style={styles.title}>FlexaBot</Text>
        <Pressable style={styles.back} onPress={() => router.push("/support")}>
          <Feather name="life-buoy" size={18} color="#0F172A" />
        </Pressable>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 12 }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === "user" ? styles.user : styles.bot,
            ]}
          >
            <Text
              style={[styles.text, item.role === "user" && styles.textUser]}
            >
              {item.content}
            </Text>
          </View>
        )}
      />
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask FlexaBot…"
          placeholderTextColor="#94A3B8"
          onSubmitEditing={() => void onSend()}
        />
        <Pressable
          style={[styles.send, (!draft.trim() || busy) && styles.sendDisabled]}
          onPress={() => void onSend()}
          disabled={!draft.trim() || busy}
        >
          {busy ? (
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
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  bubble: {
    maxWidth: "85%",
    borderRadius: 14,
    padding: 12,
    marginVertical: 4,
  },
  user: { alignSelf: "flex-end", backgroundColor: "#F97316" },
  bot: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  text: { color: "#0F172A", fontSize: 15, lineHeight: 21 },
  textUser: { color: "#fff" },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    color: "#0F172A",
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { backgroundColor: "#FDBA74" },
});
