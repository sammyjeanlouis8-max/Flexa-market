import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MusicShell } from "@/components/music/MusicShell";
import { TrackListRow } from "@/components/music/TrackRow";
import { useAuth } from "@/context/AuthContext";
import { fetchMusicCatalog, type MusicTrack } from "@/lib/musicApi";
import { playTrack } from "@/lib/musicPlayer";
import { musicTheme } from "@/lib/musicTheme";

const RECENT_SEARCH_KEY = "flexa_music_recent_searches";

export default function MusicSearchScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_SEARCH_KEY).then((raw) => {
      if (raw) setRecent(JSON.parse(raw));
    });
  }, []);

  const genres = useMemo(() => {
    const g = new Set<string>();
    for (const t of tracks) if (t.genre) g.add(t.genre);
    return [...g].sort();
  }, [tracks]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q && !genre) return;
    setLoading(true);
    try {
      const list = await fetchMusicCatalog(
        { search: q || undefined, genre: genre ?? undefined, limit: 60 },
        { token },
      );
      setTracks(list);
      if (q) {
        const next = [q, ...recent.filter((x) => x !== q)].slice(0, 8);
        setRecent(next);
        await AsyncStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
      }
    } catch {
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, [genre, query, recent, token]);

  const grouped = useMemo(() => {
    const map = new Map<string, MusicTrack[]>();
    const source = genre ? tracks.filter((t) => t.genre === genre) : tracks;
    for (const t of source) {
      const key = t.genre?.trim() || "Other";
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [genre, tracks]);

  const play = async (track: MusicTrack) => {
    await playTrack(track, tracks);
    router.push("/music/now-playing");
  };

  return (
    <MusicShell title="Explore" showNav={false}>
      <View style={styles.searchRow}>
        <Feather name="search" size={18} color={musicTheme.muted} />
        <TextInput
          style={styles.input}
          placeholder="Search artists, albums, tracks…"
          placeholderTextColor={musicTheme.muted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void runSearch()}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Feather name="x" size={18} color={musicTheme.muted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
        <Pressable
          style={[styles.chip, !genre && styles.chipOn]}
          onPress={() => setGenre(null)}
        >
          <Text style={[styles.chipText, !genre && styles.chipTextOn]}>All</Text>
        </Pressable>
        {genres.map((g) => (
          <Pressable
            key={g}
            style={[styles.chip, genre === g && styles.chipOn]}
            onPress={() => setGenre(g)}
          >
            <Text style={[styles.chipText, genre === g && styles.chipTextOn]}>{g}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Pressable style={styles.goBtn} onPress={() => void runSearch()}>
        <Text style={styles.goBtnText}>Search</Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator color={musicTheme.orange} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.results}>
          {recent.length > 0 && tracks.length === 0 ? (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Recent searches</Text>
              {recent.map((r) => (
                <Pressable
                  key={r}
                  style={styles.recentRow}
                  onPress={() => {
                    setQuery(r);
                    setTimeout(() => void runSearch(), 0);
                  }}
                >
                  <Feather name="clock" size={14} color={musicTheme.muted} />
                  <Text style={styles.recentText}>{r}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {grouped.map(([label, list]) => (
            <View key={label} style={styles.block}>
              <Text style={styles.blockTitle}>{label}</Text>
              {list.map((t) => (
                <TrackListRow key={t.id} track={t} onPress={() => void play(t)} />
              ))}
            </View>
          ))}
          {tracks.length === 0 && !loading ? (
            <Text style={styles.hint}>Search the Flexa Music catalog.</Text>
          ) : null}
        </ScrollView>
      )}
    </MusicShell>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: musicTheme.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: musicTheme.line,
  },
  input: { flex: 1, color: musicTheme.white, fontSize: 16 },
  filters: { paddingHorizontal: 16, marginTop: 10, maxHeight: 44 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: musicTheme.line,
    marginRight: 8,
  },
  chipOn: { backgroundColor: musicTheme.forest, borderColor: musicTheme.orange },
  chipText: { color: musicTheme.muted, fontWeight: "700", fontSize: 12 },
  chipTextOn: { color: musicTheme.orange },
  goBtn: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: musicTheme.orange,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  goBtnText: { color: musicTheme.white, fontWeight: "800" },
  results: { paddingHorizontal: 16, paddingBottom: 120, paddingTop: 16 },
  block: { marginBottom: 20 },
  blockTitle: { color: musicTheme.white, fontWeight: "800", fontSize: 16, marginBottom: 8 },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  recentText: { color: musicTheme.muted },
  hint: { color: musicTheme.muted, textAlign: "center", marginTop: 32 },
});