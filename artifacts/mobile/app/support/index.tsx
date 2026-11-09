import { StateView } from "@/components/StateView";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
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

type Thread = {
  id: number;
  ticketRef?: string;
  subject?: string;
  status?: string;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadByUser?: number;
  estimatedResponseLabel?: string | null;
  assignedAdminName?: string | null;
  rating?: number | null;
};

export default function SupportIndex() {
  const { token, user } = useAuth();
  useAndroidBack();
  const [rows, setRows] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/support/threads", { token, auth: true });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.error || `Support failed (${res.status})`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Could not load support tickets.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function createTicket() {
    if (!token || !subject.trim() || !message.trim() || creating) return;
    setCreating(true);
    try {
      const res = await apiFetch("/support/threads", {
        method: "POST",
        token,
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Create failed (${res.status})`);
      setSubject("");
      setMessage("");
      setShowForm(false);
      if (data.id) router.push(`/support/${data.id}`);
      else await load();
    } catch (e: any) {
      setError(e?.message || "Could not create ticket.");
    } finally {
      setCreating(false);
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
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/inbox"))}>
          <Feather name="arrow-left" size={20} color="#F8FAFC" />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.brand}>Flexa Market</Text>
          <Text style={styles.title}>Support</Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={() => router.push("/chatbot")}>
          <Feather name="message-circle" size={18} color="#F97316" />
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={() => setShowForm((v) => !v)}>
          <Text style={styles.primaryText}>{showForm ? "Cancel" : "New ticket"}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.push("/chatbot")}>
          <Text style={styles.secondaryText}>FlexaBot</Text>
        </Pressable>
      </View>

      {showForm ? (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject"
            placeholderTextColor="#64748B"
          />
          <TextInput
            style={[styles.input, styles.area]}
            value={message}
            onChangeText={setMessage}
            placeholder="Describe your issue…"
            placeholderTextColor="#64748B"
            multiline
          />
          <Pressable style={styles.primary} onPress={() => void createTicket()} disabled={creating}>
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Submit ticket</Text>}
          </Pressable>
        </View>
      ) : null}

      <StateView
        loading={loading && rows.length === 0}
        error={rows.length === 0 ? error : null}
        empty={!loading && !error && rows.length === 0}
        emptyTitle="No support tickets"
        emptyDetail="Create a ticket or ask FlexaBot. Agent identities, ticket numbers, and ETA labels come from the existing support API."
        onRetry={load}
      >
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const unread = Number(item.unreadByUser) || 0;
            return (
              <Pressable style={styles.row} onPress={() => router.push(`/support/${item.id}`)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ticket}>#{item.ticketRef || item.id}</Text>
                  <Text style={styles.subject} numberOfLines={1}>
                    {item.subject}
                  </Text>
                  <Text style={styles.preview} numberOfLines={1}>
                    {item.lastMessage || item.status}
                  </Text>
                  {item.estimatedResponseLabel ? (
                    <Text style={styles.eta}>ETA: {item.estimatedResponseLabel}</Text>
                  ) : null}
                  {item.assignedAdminName ? (
                    <Text style={styles.agent}>Agent: {item.assignedAdminName}</Text>
                  ) : null}
                </View>
                {unread > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unread}</Text>
                  </View>
                ) : (
                  <Feather name="chevron-right" size={18} color="#64748B" />
                )}
              </Pressable>
            );
          }}
        />
      </StateView>
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
  actions: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 8 },
  primary: {
    flex: 1,
    backgroundColor: "#F97316",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryText: { color: "#F8FAFC", fontWeight: "600" },
  form: { paddingHorizontal: 16, marginTop: 10, gap: 8 },
  input: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#F8FAFC",
  },
  area: { minHeight: 90, textAlignVertical: "top" },
  list: { padding: 16, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  ticket: { color: "#F97316", fontSize: 12, fontWeight: "800" },
  subject: { color: "#F8FAFC", fontWeight: "700", marginTop: 2 },
  preview: { color: "#94A3B8", fontSize: 13, marginTop: 2 },
  eta: { color: "#64748B", fontSize: 11, marginTop: 4 },
  agent: { color: "#64748B", fontSize: 11 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});
