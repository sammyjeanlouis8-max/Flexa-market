/**
 * Flexa TV — GET /api/tv/now-playing, /tv/schedule, /tv/programs
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { apiRequest, formatWhen } from "@/lib/request";

type Program = {
  id: number;
  title: string;
  description?: string | null;
  type?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  durationMinutes?: number | null;
  scheduledAt?: string | null;
  seriesTitle?: string | null;
  viewCount?: number | null;
};

export default function TvScreen() {
  const router = useRouter();
  const [now, setNow] = useState<Program | null>(null);
  const [schedule, setSchedule] = useState<Program[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    try {
      const [np, sch, prog] = await Promise.all([
        apiRequest<{ program: Program | null }>("/tv/now-playing"),
        apiRequest<{ schedule?: Program[] } | Program[]>("/tv/schedule").catch(() => ({ schedule: [] })),
        apiRequest<{ programs?: Program[] } | Program[]>("/tv/programs").catch(() => ({ programs: [] })),
      ]);
      setNow(np.program ?? null);
      const schList = Array.isArray(sch) ? sch : sch.schedule ?? [];
      const progList = Array.isArray(prog) ? prog : (prog as any).programs ?? [];
      setSchedule(schList);
      setPrograms(progList);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Flexa TV");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const play = (p: Program) => {
    if (p.videoUrl) {
      Linking.openURL(p.videoUrl).catch(() => {});
      return;
    }
    void apiRequest(`/tv/programs/${p.id}/view`, { method: "POST", body: {} }).catch(() => {});
  };

  const list = schedule.length ? schedule : programs;

  return (
    <View style={styles.root}>
      <AppHeader title="Flexa TV" showBack />
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => String(p.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={colors.flexaGreen} />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListHeaderComponent={
            <View style={{ marginBottom: 12 }}>
              {error ? (
                <View style={styles.banner}>
                  <Text style={styles.bannerText}>{error}</Text>
                  <Pressable onPress={() => void load()}>
                    <Text style={styles.retry}>Retry</Text>
                  </Pressable>
                </View>
              ) : null}
              <Text style={styles.hero}>Now playing</Text>
              {now ? (
                <Pressable style={styles.now} onPress={() => play(now)}>
                  {now.thumbnailUrl ? (
                    <Image source={{ uri: now.thumbnailUrl }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbFallback]}>
                      <Feather name="tv" size={28} color="#fff" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nowTitle}>{now.title}</Text>
                    {now.seriesTitle ? <Text style={styles.meta}>{now.seriesTitle}</Text> : null}
                    <Text style={styles.meta} numberOfLines={2}>
                      {now.description || "Tap to watch"}
                    </Text>
                  </View>
                </Pressable>
              ) : (
                <View style={styles.emptyNow}>
                  <Text style={styles.empty}>Nothing scheduled right now</Text>
                </View>
              )}
              <Text style={[styles.hero, { marginTop: 16 }]}>Schedule & catalog</Text>
            </View>
          }
          ListEmptyComponent={
            !error ? (
              <View style={styles.center}>
                <Text style={styles.empty}>No programs available</Text>
                <Pressable onPress={() => router.push("/help-center")}>
                  <Text style={styles.retry}>Help Center</Text>
                </Pressable>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => play(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.meta}>
                  {[item.type, item.durationMinutes ? `${item.durationMinutes} min` : null, formatWhen(item.scheduledAt)]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <Feather name="play-circle" size={22} color={colors.flexaGreen} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  hero: { fontSize: 18, fontWeight: "800", color: colors.light.text, marginBottom: 8 },
  banner: { backgroundColor: "#FEF2F2", padding: 10, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: "#B91C1C" },
  retry: { color: colors.flexaGreen, fontWeight: "700", marginTop: 4 },
  now: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 12,
  },
  thumb: { width: 88, height: 88, borderRadius: 12, backgroundColor: "#1E293B" },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  nowTitle: { color: "#fff", fontWeight: "800", fontSize: 16 },
  meta: { color: "#94A3B8", fontSize: 12, marginTop: 3 },
  emptyNow: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 16,
  },
  empty: { color: "#94A3B8", fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { fontWeight: "700", color: colors.light.text },
});
