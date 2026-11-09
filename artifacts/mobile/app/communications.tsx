import { StateView } from "@/components/StateView";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Communications / system announcements.
 * Sourced from existing in-app notifications with type admin_broadcast
 * (and related announcement types). Backend already persists these even
 * when Expo/FCM delivery fails.
 */
type Announcement = {
  id: number;
  type?: string;
  message?: string | null;
  isRead?: boolean;
  createdAt?: string;
};

function isAnnouncement(type: string | undefined | null) {
  const t = (type || "").toLowerCase();
  return (
    t === "admin_broadcast" ||
    t.includes("announcement") ||
    t === "communications" ||
    t === "system"
  );
}

export default function CommunicationsScreen() {
  const { token, user } = useAuth();
  useAndroidBack();
  const [rows, setRows] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/notifications", { token, auth: true });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      const all = Array.isArray(data) ? data : [];
      setRows(all.filter((n: Announcement) => isAnnouncement(n.type)));
    } catch (e: any) {
      setError(e?.message || "Could not load announcements.");
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

  async function openItem(item: Announcement) {
    if (!token) return;
    if (!item.isRead) {
      await apiFetch(`/notifications/${item.id}/read`, { method: "POST", token }).catch(() => null);
      setRows((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
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
        <Pressable style={styles.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/notifications"))}>
          <Feather name="arrow-left" size={20} color="#F8FAFC" />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.brand}>Flexa Market</Text>
          <Text style={styles.title}>Communications</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <Text style={styles.intro}>
        System announcements and admin broadcasts. Push delivery may fail; these records remain in
        your notification history.
      </Text>

      <StateView
        loading={loading && rows.length === 0}
        error={rows.length === 0 ? error : null}
        empty={!loading && !error && rows.length === 0}
        emptyTitle="No announcements"
        emptyDetail="When Flexa Market sends a system announcement, it will appear here."
        onRetry={load}
      >
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, !item.isRead && styles.unread]}
              onPress={() => void openItem(item)}
            >
              <Text style={styles.msg}>{item.message || "Announcement"}</Text>
              <Text style={styles.meta}>
                {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
                {!item.isRead ? " · Unread" : ""}
              </Text>
            </Pressable>
          )}
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
  intro: { color: "#94A3B8", fontSize: 13, paddingHorizontal: 16, marginTop: 8, marginBottom: 4 },
  list: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  unread: { borderColor: "#F97316" },
  msg: { color: "#F8FAFC", fontSize: 15, lineHeight: 22 },
  meta: { color: "#64748B", fontSize: 11, marginTop: 8 },
});
