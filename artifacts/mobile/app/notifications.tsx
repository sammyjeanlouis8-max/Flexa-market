import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { SignInGate } from "@/components/SignInGate";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/apiFetch";

type NotificationItem = {
  id: number;
  title?: string;
  body?: string;
  message?: string;
  read?: boolean;
  createdAt?: string;
};

export default function NotificationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<NotificationItem[] | { notifications?: NotificationItem[] }>(
        "/notifications",
        { token },
      );
      const list = Array.isArray(data) ? data : data.notifications ?? [];
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const markAll = async () => {
    if (!token) return;
    try {
      await apiFetch("/notifications/read-all", { token, method: "POST", body: {} });
      await load();
    } catch {
      /* non-fatal */
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
        <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
        {token ? (
          <Pressable onPress={() => void markAll()}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      {!token ? (
        <View style={styles.pad}>
          <SignInGate message="Sign in to view notifications." />
        </View>
      ) : error ? (
        <Text style={{ color: "#F87171", padding: 20 }}>{error}</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void load()} />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>
                No notifications.
              </Text>
            )
          }
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: colors.border }]}>
              <Text style={{ color: colors.foreground, fontWeight: item.read ? "500" : "700" }}>
                {item.title || "Notification"}
              </Text>
              <Text style={{ color: colors.mutedForeground, marginTop: 4 }}>
                {item.body || item.message || ""}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, gap: 6 },
  title: { fontSize: 28, fontWeight: "700" },
  pad: { padding: 20 },
  list: { padding: 20, paddingBottom: 40 },
  row: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
});
