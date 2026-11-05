import { useRouter } from "expo-router";
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

import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/apiFetch";

type Track = {
  id: number | string;
  title?: string;
  artistName?: string;
  artist?: string;
  coverUrl?: string | null;
};

export default function MusicScreen() {
  const colors = useColors();
  const router = useRouter();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Track[] | { tracks?: Track[] }>("/music");
      const list = Array.isArray(data) ? data : data.tracks ?? [];
      setTracks(list.slice(0, 80));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load music");
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
        <Text style={[styles.title, { color: colors.foreground }]}>Flexa Music</Text>
        <Text style={{ color: colors.mutedForeground }}>
          Native catalog from /api/music. Upload and earnings screens follow.
        </Text>
      </View>
      {error ? (
        <Text style={{ color: "#F87171", padding: 20 }}>{error}</Text>
      ) : (
        <FlatList
          data={tracks}
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
                No tracks available.
              </Text>
            )
          }
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: colors.border }]}>
              <Text style={{ color: colors.foreground, fontWeight: "600" }} numberOfLines={1}>
                {item.title || `Track #${item.id}`}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
                {item.artistName || item.artist || "Artist"}
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
  list: { padding: 20, paddingBottom: 40 },
  row: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
});
