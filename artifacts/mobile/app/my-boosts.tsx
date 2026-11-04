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

type BoostItem = {
  id: number | string;
  listingId?: number;
  status?: string;
  title?: string;
  endsAt?: string;
};

export default function MyBoostsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const [items, setItems] = useState<BoostItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<BoostItem[] | { boosts?: BoostItem[] }>(
        "/boost/my-active",
        { token },
      );
      const list = Array.isArray(data) ? data : data.boosts ?? [];
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load boosts");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.mutedForeground }}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>My boosts</Text>
        <Pressable onPress={() => router.push("/boost")}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>Buy a boost</Text>
        </Pressable>
      </View>

      {!token ? (
        <View style={styles.pad}>
          <SignInGate message="Sign in to view boosts." />
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
                No active boosts.
              </Text>
            )
          }
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: colors.border }]}>
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                {item.title || `Boost #${item.id}`}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
                {item.status || "active"}
                {item.endsAt ? ` · ends ${new Date(item.endsAt).toLocaleString()}` : ""}
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
