import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { TrackListRow } from "@/components/music/TrackRow";
import { useAuth } from "@/context/AuthContext";
import {
  absoluteMusicUrl,
  fetchPlaylist,
  type MusicPlaylist,
  type MusicTrack,
} from "@/lib/musicApi";
import { setQueue } from "@/lib/musicPlayer";
import { musicTheme } from "@/lib/musicTheme";

export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const [playlist, setPlaylist] = useState<MusicPlaylist | null>(null);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await fetchPlaylist(id, { token });
      setPlaylist(data.playlist);
      setTracks(data.tracks);
    } catch {
      setPlaylist({ id: Number(id), title: "Playlist", track_count: 0 });
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const cover = absoluteMusicUrl(playlist?.cover_url);

  const playAll = async () => {
    if (!tracks.length) return;
    await setQueue(tracks, 0);
    router.push("/music/now-playing");
  };

  return (
    <View style={styles.root}>
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Feather name="chevron-left" size={24} color={musicTheme.white} />
      </Pressable>
      {loading ? (
        <ActivityIndicator color={musicTheme.orange} style={{ marginTop: 80 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={() => {}} accessibilityRole="header">
            {cover ? (
              <Image source={{ uri: cover }} style={styles.hero} contentFit="cover" />
            ) : (
              <View style={[styles.hero, styles.heroFb]}>
                <Feather name="disc" size={48} color={musicTheme.orange} />
              </View>
            )}
            <Text style={styles.title}>{playlist?.title ?? "Playlist"}</Text>
            {playlist?.description ? (
              <Text style={styles.desc}>{playlist.description}</Text>
            ) : null}
          </Pressable>
          <Pressable style={styles.playBtn} onPress={() => void playAll()}>
            <Feather name="play" size={18} color={musicTheme.white} />
            <Text style={styles.playText}>Play queue</Text>
          </Pressable>
          {tracks.length ? (
            tracks.map((t) => (
              <TrackListRow
                key={t.id}
                track={t}
                onPress={async () => {
                  await setQueue(tracks, tracks.findIndex((x) => x.id === t.id));
                  router.push("/music/now-playing");
                }}
              />
            ))
          ) : (
            <Text style={styles.empty}>This playlist has no tracks yet.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: musicTheme.charcoal, paddingTop: 48 },
  back: { position: "absolute", top: 52, left: 12, zIndex: 2 },
  scroll: { paddingHorizontal: 16, paddingBottom: 120 },
  hero: { width: "100%", aspectRatio: 1, maxHeight: 280, borderRadius: 16, marginBottom: 16 },
  heroFb: { backgroundColor: musicTheme.forest, alignItems: "center", justifyContent: "center" },
  title: { color: musicTheme.white, fontSize: 26, fontWeight: "800" },
  desc: { color: musicTheme.muted, marginTop: 8, lineHeight: 20 },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: musicTheme.orange,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    marginVertical: 16,
  },
  playText: { color: musicTheme.white, fontWeight: "800" },
  empty: { color: musicTheme.muted, marginTop: 12 },
});