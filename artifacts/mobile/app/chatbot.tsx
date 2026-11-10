/**
 * FlexaBot — verified RAG chatbot with escalation to human support tickets.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
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
import { createSupportThread, sendChatbotMessage } from "@/lib/supportApi";

type Row = {
  id: string;
  role: "user" | "bot";
  content: string;
  deepLinks?: { label?: string; href?: string; path?: string }[];
  escalateSuggested?: boolean;
};

const QUICK_PROMPTS = [
  "orders",
  "delivery",
  "payments",
  "account",
  "seller",
  "ticket",
] as const;

export default function ChatbotScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const { lang, t } = useLanguage();
  const welcome = useMemo(
    () => t("flexabotWelcome"),
    [t],
  );
  const [rows, setRows] = useState<Row[]>([
    { id: "welcome", role: "bot", content: welcome },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const escalate = async (history: Row[]) => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    setBusy(true);
    try {
      const botHistory = history
        .filter((r) => r.id !== "welcome")
        .map((r) => ({
          role: (r.role === "bot" ? "bot" : "user") as "bot" | "user",
          content: r.content,
        }));
      const lastUser = [...history].reverse().find((r) => r.role === "user")?.content || "Help";
      const thread = await createSupportThread(
        {
          subject: lastUser.slice(0, 80) || "FlexaBot escalation",
          message: lastUser,
          botHistory,
        },
        { token },
      );
      Alert.alert(
        t("supportTicketCreated"),
        `${t("supportTicketNumber")}: ${thread.ticketRef || thread.id}`,
        [{ text: t("ok"), onPress: () => router.replace(`/support/${thread.id}`) }],
      );
    } catch (e) {
      Alert.alert(t("supportCreateFailed"), e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const onSend = async (preset?: string) => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    const content = (preset ?? draft).trim();
    if (!content || busy) return;
    if (!preset) setDraft("");
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
        (typeof data.content === "string" && data.content) ||
        (typeof data.reply === "string" && data.reply) ||
        (typeof data.message === "string" && data.message) ||
        t("flexabotFallback");
      const botRow: Row = {
        id: `b-${Date.now()}`,
        role: "bot",
        content: reply,
        deepLinks: Array.isArray(data.deepLinks) ? data.deepLinks : undefined,
        escalateSuggested: Boolean(data.escalateSuggested),
      };
      setRows((prev) => [...prev, botRow]);
    } catch (e) {
      setRows((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "bot",
          content: e instanceof Error ? e.message : t("flexabotUnavailable"),
          escalateSuggested: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const openDeepLink = (href?: string, path?: string) => {
    const raw = path || href || "";
    if (!raw) return;
    try {
      if (raw.startsWith("http")) {
        const u = new URL(raw);
        router.push(u.pathname as any);
        return;
      }
      router.push(raw as any);
    } catch {
      /* ignore bad links */
    }
  };

  const promptLabel = (key: string) => {
    switch (key) {
      case "orders":
        return t("flexabotPromptOrders");
      case "delivery":
        return t("flexabotPromptDelivery");
      case "payments":
        return t("flexabotPromptPayments");
      case "account":
        return t("flexabotPromptAccount");
      case "seller":
        return t("flexabotPromptSeller");
      case "ticket":
        return t("flexabotPromptTicket");
      default:
        return key;
    }
  };

  const promptText = (key: string) => {
    switch (key) {
      case "orders":
        return "Help me with my orders";
      case "delivery":
        return "Help me track a delivery";
      case "payments":
        return "Help me with payments and wallet";
      case "account":
        return "Help me with my account";
      case "seller":
        return "Help me as a seller";
      case "ticket":
        return "I need to open a support ticket";
      default:
        return key;
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
        <Text style={styles.title}>{t("flexabotTitle")}</Text>
        <Pressable style={styles.back} onPress={() => router.push("/support")}>
          <Feather name="life-buoy" size={18} color="#0F172A" />
        </Pressable>
      </View>

      <FlatList
        horizontal
        data={[...QUICK_PROMPTS]}
        keyExtractor={(k) => k}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingBottom: 8 }}
        renderItem={({ item }) => (
          <Pressable style={styles.chip} onPress={() => void onSend(promptText(item))} disabled={busy}>
            <Text style={styles.chipText}>{promptLabel(item)}</Text>
          </Pressable>
        )}
      />

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 12 }}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.user : styles.bot]}>
            <Text style={[styles.text, item.role === "user" && styles.textUser]}>{item.content}</Text>
            {item.deepLinks?.length ? (
              <View style={styles.links}>
                {item.deepLinks.map((link, i) => (
                  <Pressable
                    key={`${link.href || link.path}-${i}`}
                    style={styles.linkBtn}
                    onPress={() => openDeepLink(link.href, link.path)}
                  >
                    <Text style={styles.linkText}>{link.label || link.path || link.href}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {item.escalateSuggested ? (
              <Pressable style={styles.escalate} onPress={() => void escalate(rows)} disabled={busy}>
                <Text style={styles.escalateText}>{t("flexabotEscalate")}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      />

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={t("flexabotPlaceholder")}
          placeholderTextColor="#94A3B8"
          editable={!busy}
          onSubmitEditing={() => void onSend()}
        />
        <Pressable
          style={[styles.send, (!draft.trim() || busy) && styles.sendDisabled]}
          onPress={() => void onSend()}
          disabled={!draft.trim() || busy}
        >
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="send" size={16} color="#fff" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontWeight: "800", fontSize: 17, color: "#0F172A" },
  chip: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { fontWeight: "700", fontSize: 12, color: "#0F172A" },
  bubble: { maxWidth: "88%", borderRadius: 14, padding: 12, marginBottom: 10, gap: 8 },
  user: { alignSelf: "flex-end", backgroundColor: "#F97316" },
  bot: { alignSelf: "flex-start", backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0" },
  text: { color: "#0F172A", lineHeight: 20 },
  textUser: { color: "#fff" },
  links: { gap: 6 },
  linkBtn: {
    backgroundColor: "#FFF7ED",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  linkText: { color: "#C2410C", fontWeight: "700", fontSize: 12 },
  escalate: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  escalateText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    color: "#0F172A",
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.5 },
});
