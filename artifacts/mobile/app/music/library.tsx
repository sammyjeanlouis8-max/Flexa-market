import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MusicShell } from "@/components/music/MusicShell";
import { TrackListRow } from "@/components/music/TrackRow";
import { useAuth } from "@/context/AuthContext";
import { fetchMusicCatalog, fetchMusicTrack, type MusicTrack } from "@/lib/musicApi";
import { playTrack } from "@/lib/musicPlayer";
import { musicTheme } from "@/lib/musicTheme";

const LIKED_KEY = "flexa_music_liked_ids";
const RECENT_KEY = "flexa_music_recent";

export default function MusicLibraryScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [liked, setLiked] = useState<MusicTrack[]>([]);
  const [recent, setRecent] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [likedRaw, recentRaw] = await Promise.all([
        AsyncStorage.getItem(LIKED_KEY),
        AsyncStorage.getItem(RECENT_KEY),
      ]);
      const likedIds: number[] = likedRaw ? JSON.parse(likedRaw) : [];
      const recentList: MusicTrack[] = recentRaw ? JSON.parse(recentRaw) : [];
      setRecent(recentList);
      const fetched: MusicTrack[] = [];
      for (const id of likedIds.slice(0, 40)) {
        try {
          fetched.push(await fetchMusicTrack(id, { token }));
        } catch {
          /* skip stale */
        }
      }
      if (!fetched.length && token) {
        const catalog = await fetchMusicCatalog({ limit: 20 }, { token });
        setLiked(catalog.slice(0, 8));
      } else {
        setLiked(fetched);
      }
    } catch {
      setLiked([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const play = async (track: MusicTrack, list: MusicTrack[]) => {
    await playTrack(track, list);
    router.push("/music/now-playing");
  };

  return (
    <MusicShell title="Library" showNav={false}>
      {loading ? (
        <ActivityIndicator color={musicTheme.orange} style={{ marginTop: 32 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.rowHead}>
            <Text style={styles.section}>Saved & liked</Text>
            <Pressable onPress={() => router.push("/music/playlists")}>
              <Text style={styles.link}>Playlists</Text>
            </Pressable>
          </View>
          {liked.length ? (
            liked.map((t) => (
              <TrackListRow key={t.id} track={t} onPress={() => void play(t, liked)} />
            ))
          ) : (
            <Text style={styles.muted}>Tap Favorite on a track while signed in.</Text>
          )}

          <Text style={[styles.section, { marginTop: 24 }]}>Recently played</Text>
          {recent.length ? (
            recent.map((t) => (
              <TrackListRow key={`r-${t.id}`} track={t} onPress={() => void play(t, recent)} />
            ))
          ) : (
            <Text style={styles.muted}>Nothing played yet.</Text>
          )}
        </ScrollView>
      )}
    </MusicShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingBottom: 120 },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  section: {
    color: musicTheme.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 8,
  },
  link: { color: musicTheme.orange, fontWeight: "700" },
  muted: { color: musicTheme.muted, marginBottom: 12 },
});