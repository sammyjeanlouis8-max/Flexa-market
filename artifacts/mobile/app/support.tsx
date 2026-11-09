/**
 * Native Support Home — tickets list + create + FlexaBot entry.
 * Voice messages are prohibited in support (UI + API).
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  createSupportThread,
  fetchSupportThreads,
  type SupportThread,
} from "@/lib/supportApi";

export default function SupportHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<SupportThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const data = await fetchSupportThreads({ token });
        setRows(data);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load support");
        setRows((prev) => prev ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load("initial");
    }, [authLoading, token, router, load]),
  );

  const onCreate = async () => {
    if (!token) return;
    if (subject.trim().length < 3 || !message.trim()) {
      Alert.alert("Ticket", "Subject (3+ chars) and message are required.");
      return;
    }
    setCreating(true);
    try {
      const thread = await createSupportThread(
        { subject: subject.trim(), message: message.trim() },
        { token },
      );
      setOpen(false);
      setSubject("");
      setMessage("");
      router.push(`/support/${thread.id}`);
    } catch (e) {
      Alert.alert("Create failed", e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Support</Text>
        <Pressable style={styles.add} onPress={() => setOpen(true)}>
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      <Pressable style={styles.botCard} onPress={() => router.push("/chatbot")}>
        <Feather name="cpu" size={20} color="#F97316" />
        <View style={{ flex: 1 }}>
          <Text style={styles.botTitle}>FlexaBot</Text>
          <Text style={styles.botSub}>Quick answers before opening a ticket</Text>
        </View>
        <Feather name="chevron-right" size={18} color="#94A3B8" />
      </Pressable>

      <Text style={styles.note}>
        Support chat allows text, images, and videos. Voice messages are not allowed.
      </Text>

      {rows === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={rows ?? []}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor="#F97316"
            />
          }
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            <Text style={styles.empty}>No support tickets yet.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/support/${item.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.subject}
                </Text>
                <Text style={styles.rowSub}>
                  {(item.ticketRef as string) || `#${item.id}`} · {item.status || "open"}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color="#94A3B8" />
            </Pressable>
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        />
      )}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.modal, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.topBar}>
            <Pressable style={styles.back} onPress={() => setOpen(false)}>
              <Feather name="x" size={22} color="#0F172A" />
            </Pressable>
            <Text style={styles.title}>New ticket</Text>
            <View style={{ width: 40 }} />
          </View>
          <Text style={styles.label}>Subject</Text>
          <TextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder="What do you need help with?"
            placeholderTextColor="#94A3B8"
          />
          <Text style={styles.label}>Message</Text>
          <TextInput
            style={[styles.input, { minHeight: 120, textAlignVertical: "top" }]}
            value={message}
            onChangeText={setMessage}
            multiline
            placeholder="Describe your issue"
            placeholderTextColor="#94A3B8"
          />
          <Pressable
            style={[styles.createBtn, creating && { opacity: 0.7 }]}
            onPress={() => void onCreate()}
            disabled={creating}
          >
            {creating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.createText}>Create ticket</Text>
            )}
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  modal: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  add: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F97316",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  botCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginBottom: 10,
  },
  botTitle: { fontWeight: "800", color: "#0F172A" },
  botSub: { color: "#64748B", fontSize: 12, marginTop: 2 },
  note: { color: "#64748B", fontSize: 12, marginBottom: 10, lineHeight: 17 },
  error: { color: "#B91C1C", marginBottom: 8, fontWeight: "600" },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginBottom: 8,
  },
  rowTitle: { fontWeight: "700", color: "#0F172A" },
  rowSub: { color: "#64748B", fontSize: 12, marginTop: 2, textTransform: "capitalize" },
  label: { fontSize: 12, fontWeight: "700", color: "#94A3B8", marginBottom: 6 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#0F172A",
    marginBottom: 12,
  },
  createBtn: {
    height: 52,
    borderRadius: 999,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  createText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
