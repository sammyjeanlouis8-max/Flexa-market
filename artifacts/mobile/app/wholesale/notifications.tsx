import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import {
  fetchWholesaleNotifications,
  markWholesaleNotificationsRead,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

type N = Awaited<ReturnType<typeof fetchWholesaleNotifications>>["notifications"][number];

export default function WholesaleNotificationsScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<N[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchWholesaleNotifications({ token, limit: 50 });
      setRows(page.notifications);
    } catch (e: any) {
      setError(e?.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const markAll = async () => {
    if (!token) return;
    await markWholesaleNotificationsRead({ token });
    await load();
  };

  return (
    <WholesaleGate>
      <WholesaleShell
        title="Notifications"
        subtitle="Wholesale quotes, deals, and depot updates"
        headerRight={
          <Pressable onPress={() => void markAll()}>
            <Text style={styles.mark}>Mark all read</Text>
          </Pressable>
        }
      >
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No wholesale notifications yet.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((n) => (
              <Pressable
                key={n.id}
                style={[styles.row, !n.readAt && styles.unread]}
                onPress={() => n.href && router.push(n.href as any)}
              >
                <Text style={styles.title}>{n.title}</Text>
                <Text style={styles.meta}>{n.body}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  mark: { color: T.accent, fontWeight: "700", fontSize: 12 },
  list: { gap: 8 },
  row: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  unread: { borderColor: T.accent },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { marginTop: 2, fontSize: 12, color: T.muted },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
