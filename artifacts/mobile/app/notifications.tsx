import { StateView } from "@/components/StateView";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import {
  notificationCategory,
  routeFromNotification,
  type NotificationLike,
} from "@/lib/notificationRouting";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Notif = NotificationLike & {
  id: number;
  isRead?: boolean;
  createdAt?: string;
  actorName?: string | null;
  listingTitle?: string | null;
};

export default function NotificationsScreen() {
  const { token, user } = useAuth();
  useAndroidBack();
  const [rows, setRows] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifyPush, setNotifyPush] = useState(true);
  const [prefsBusy, setPrefsBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [listRes, countRes, prefsRes] = await Promise.all([
        apiFetch("/notifications", { token, auth: true }),
        apiFetch("/notifications/unread-count", { token, auth: true }),
        apiFetch("/users/me/preferences", { token, auth: true }),
      ]);
      const listData = await listRes.json().catch(() => []);
      if (!listRes.ok) throw new Error(listData.error || `Notifications failed (${listRes.status})`);
      setRows(Array.isArray(listData) ? listData : []);
      if (countRes.ok) {
        const c = await countRes.json().catch(() => ({}));
        setUnread(Number(c.count) || 0);
      }
      if (prefsRes.ok) {
        const p = await prefsRes.json().catch(() => ({}));
        setNotifyPush(p.notifyPush !== false);
      }
    } catch (e: any) {
      setError(e?.message || "Could not load notifications.");
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

  async function markRead(id: number) {
    if (!token) return;
    await apiFetch(`/notifications/${id}/read`, { method: "POST", token }).catch(() => null);
    setRows((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
  }

  async function markAll() {
    if (!token) return;
    await apiFetch("/notifications/read-all", { method: "POST", token }).catch(() => null);
    setRows((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
  }

  async function togglePush(next: boolean) {
    if (!token || prefsBusy) return;
    setPrefsBusy(true);
    setNotifyPush(next);
    try {
      const res = await apiFetch("/users/me/preferences", {
        method: "PUT",
        token,
        body: JSON.stringify({ notifyPush: next }),
      });
      if (!res.ok) setNotifyPush(!next);
    } catch {
      setNotifyPush(!next);
    } finally {
      setPrefsBusy(false);
    }
  }

  function openNotif(n: Notif) {
    void markRead(n.id);
    const route = routeFromNotification(n);
    if (!route) return;
    if (route.params) router.push({ pathname: route.pathname as any, params: route.params });
    else router.push(route.pathname as any);
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
          <Text style={styles.title}>Notifications{unread > 0 ? ` · ${unread}` : ""}</Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={() => void markAll()}>
          <Feather name="check-circle" size={18} color="#F97316" />
        </Pressable>
      </View>

      <View style={styles.prefRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.prefTitle}>Push notifications</Text>
          <Text style={styles.prefSub}>Uses existing server preference (notifyPush)</Text>
        </View>
        <Switch
          value={notifyPush}
          onValueChange={(v) => void togglePush(v)}
          disabled={prefsBusy}
          trackColor={{ false: "#334155", true: "#F97316" }}
          thumbColor="#F8FAFC"
        />
      </View>

      <Pressable style={styles.commsLink} onPress={() => router.push("/communications")}>
        <Feather name="radio" size={16} color="#F97316" />
        <Text style={styles.commsText}>System announcements</Text>
        <Feather name="chevron-right" size={16} color="#64748B" />
      </Pressable>

      <StateView
        loading={loading && rows.length === 0}
        error={rows.length === 0 ? error : null}
        empty={!loading && !error && rows.length === 0}
        emptyTitle="No notifications"
        emptyDetail="Order, chat, and system alerts will appear here. History is kept even if push delivery fails."
        onRetry={load}
      >
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const unreadItem = !item.isRead;
            return (
              <Pressable
                style={[styles.row, unreadItem && styles.rowUnread]}
                onPress={() => openNotif(item)}
              >
                <View style={styles.catPill}>
                  <Text style={styles.catText}>{notificationCategory(item.type)}</Text>
                </View>
                <Text style={[styles.msg, unreadItem && styles.msgUnread]} numberOfLines={3}>
                  {item.message || item.listingTitle || item.type || "Notification"}
                </Text>
                <Text style={styles.meta}>
                  {item.actorName ? `${item.actorName} · ` : ""}
                  {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
                </Text>
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
  prefRow: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  prefTitle: { color: "#F8FAFC", fontWeight: "700" },
  prefSub: { color: "#64748B", fontSize: 11, marginTop: 2 },
  commsLink: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  commsText: { flex: 1, color: "#F8FAFC", fontWeight: "600" },
  list: { padding: 16, paddingBottom: 40 },
  row: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  rowUnread: { borderColor: "#F97316" },
  catPill: {
    alignSelf: "flex-start",
    backgroundColor: "#1E293B",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 6,
  },
  catText: { color: "#94A3B8", fontSize: 10, fontWeight: "700" },
  msg: { color: "#94A3B8", fontSize: 14, lineHeight: 20 },
  msgUnread: { color: "#F8FAFC", fontWeight: "600" },
  meta: { color: "#64748B", fontSize: 11, marginTop: 6 },
});
