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

import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/apiFetch";

type VideoItem = {
  id: number | string;
  title?: string;
  listingId?: number;
};

export default function VideosScreen() {
  const colors = useColors();
  const router = useRouter();
  const [items, setItems] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<VideoItem[] | { videos?: VideoItem[] }>("/videos");
      setItems(Array.isArray(data) ? data.slice(0, 60) : data.videos ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load videos");
    } finally {
      setLoading(false);
    }
  }, []);

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
        <Text style={[styles.title, { color: colors.foreground }]}>Videos</Text>
      </View>
      {error ? (
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
                No videos yet.
              </Text>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                item.listingId
                  ? router.push(`/listing/${item.listingId}`)
                  : undefined
              }
              style={[styles.row, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                {item.title || `Video #${item.id}`}
              </Text>
            </Pressable>
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
  list: { padding: 20, paddingBottom: 40 },
  row: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
});
