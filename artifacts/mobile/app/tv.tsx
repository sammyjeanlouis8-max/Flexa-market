import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/apiFetch";

type NowPlaying = {
  title?: string;
  programTitle?: string;
  status?: string;
  isLive?: boolean;
};

type Program = {
  id: number | string;
  title?: string;
  description?: string;
};

export default function TvScreen() {
  const colors = useColors();
  const router = useRouter();
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nowPlaying, list] = await Promise.all([
        apiFetch<NowPlaying>("/tv/now-playing").catch(() => null),
        apiFetch<Program[] | { programs?: Program[] }>("/tv/programs").catch(
          () => [],
        ),
      ]);
      setNow(nowPlaying);
      const programsList = Array.isArray(list) ? list : list.programs ?? [];
      setPrograms(programsList.slice(0, 40));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load TV");
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
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} />
        }
      >
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.mutedForeground }}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Flexa TV</Text>
        <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>
          Native schedule and now-playing from /api/tv. Full video player follows.
        </Text>

        {error ? <Text style={{ color: "#F87171" }}>{error}</Text> : null}

        <View style={[styles.card, { borderColor: colors.border }]}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Now playing</Text>
          {loading && !now ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 18, marginTop: 6 }}>
              {now?.programTitle || now?.title || "Nothing live right now"}
            </Text>
          )}
        </View>

        <Text style={[styles.section, { color: colors.foreground }]}>Programs</Text>
        {programs.length === 0 && !loading ? (
          <Text style={{ color: colors.mutedForeground }}>No programs listed.</Text>
        ) : (
          programs.map((p) => (
            <View key={String(p.id)} style={[styles.row, { borderColor: colors.border }]}>
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                {p.title || `Program #${p.id}`}
              </Text>
              {p.description ? (
                <Text
                  style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}
                  numberOfLines={2}
                >
                  {p.description}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  section: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  row: { borderWidth: 1, borderRadius: 12, padding: 14 },
});
