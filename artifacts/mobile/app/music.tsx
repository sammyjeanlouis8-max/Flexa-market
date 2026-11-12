/**
 * Flexa Music — GET /api/music, stream-url, like
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
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, money } from "@/lib/request";

type Track = {
  id: number;
  title: string;
  artist?: string | null;
  album?: string | null;
  genre?: string | null;
  coverUrl?: string | null;
  cover_url?: string | null;
  audioUrl?: string | null;
  audio_url?: string | null;
  durationSeconds?: number | null;
  duration_seconds?: number | null;
  priceUsd?: number | null;
  price_usd?: number | null;
  playCount?: number | null;
  play_count?: number | null;
  isFeatured?: boolean;
};

function coverOf(t: Track) {
  return t.coverUrl || t.cover_url || null;
}
function durOf(t: Track) {
  const s = t.durationSeconds ?? t.duration_seconds ?? 0;
  const m = Math.floor(Number(s) / 60);
  const r = Math.floor(Number(s) % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function MusicScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial", search = q) => {
      if (mode === "refresh") setRefreshing(true);
      try {
        const qs = new URLSearchParams({ limit: "50" });
        if (search.trim()) qs.set("search", search.trim());
        const data = await apiRequest<{ tracks: Track[] }>(`/music?${qs}`);
        setTracks(data.tracks ?? []);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load music");
        setTracks((p) => p ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [q],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const play = async (t: Track) => {
    try {
      const res = await apiRequest<{ url?: string; streamUrl?: string }>(`/music/stream-url/${t.id}`);
      const url = res.url || res.streamUrl || t.audioUrl || t.audio_url;
      if (url) await Linking.openURL(url);
    } catch (e) {
      const fallback = t.audioUrl || t.audio_url;
      if (fallback) Linking.openURL(fallback).catch(() => {});
      else setError(e instanceof Error ? e.message : "Playback unavailable");
    }
  };

  const like = async (id: number) => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    try {
      await apiRequest(`/music/${id}/like`, { token, method: "POST", body: {} });
    } catch {
      /* ignore */
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Flexa Music" showBack />
      <View style={styles.search}>
        <Feather name="search" size={18} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="Search tracks or artists"
          placeholderTextColor="#94A3B8"
          onSubmitEditing={() => void load("initial", q)}
          returnKeyType="search"
        />
        <Pressable onPress={() => void load("initial", q)}>
          <Text style={styles.go}>Go</Text>
        </Pressable>
      </View>
      {tracks === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={tracks ?? []}
          keyExtractor={(t) => String(t.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={colors.flexaGreen} />
          }
          contentContainerStyle={!(tracks && tracks.length) ? { flexGrow: 1, justifyContent: "center", padding: 24 } : { padding: 16 }}
          ListHeaderComponent={
            error ? (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>{error}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="music" size={36} color="#94A3B8" />
              <Text style={styles.empty}>No tracks found</Text>
            </View>
          }
          renderItem={({ item }) => {
            const c = coverOf(item);
            const price = item.priceUsd ?? item.price_usd;
            return (
              <View style={styles.row}>
                {c ? (
                  <Image source={{ uri: c }} style={styles.cover} contentFit="cover" />
                ) : (
                  <View style={[styles.cover, styles.coverFallback]}>
                    <Feather name="music" size={18} color="#fff" />
                  </View>
                )}
                <Pressable style={{ flex: 1 }} onPress={() => void play(item)}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.artist || "Unknown"} · {durOf(item)}
                    {price ? ` · ${money(price)}` : ""}
                  </Text>
                </Pressable>
                <Pressable onPress={() => void like(item.id)} style={styles.iconBtn}>
                  <Feather name="heart" size={18} color={colors.flexaOrange} />
                </Pressable>
                <Pressable onPress={() => void play(item)} style={styles.iconBtn}>
                  <Feather name="play" size={18} color={colors.flexaGreen} />
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, color: colors.light.text },
  go: { color: colors.flexaGreen, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  banner: { backgroundColor: "#FEF2F2", padding: 10, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: "#B91C1C" },
  empty: { color: "#94A3B8", fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 10,
    marginBottom: 8,
  },
  cover: { width: 52, height: 52, borderRadius: 10, backgroundColor: "#1E293B" },
  coverFallback: { alignItems: "center", justifyContent: "center" },
  title: { fontWeight: "700", color: colors.light.text },
  meta: { fontSize: 12, color: "#64748B", marginTop: 2 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
