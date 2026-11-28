import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MusicShell } from "@/components/music/MusicShell";
import { useAuth } from "@/context/AuthContext";
import {
  absoluteMusicUrl,
  fetchPlaylists,
  fetchPlaylist,
  type MusicPlaylist,
} from "@/lib/musicApi";
import { setQueue } from "@/lib/musicPlayer";
import { musicTheme } from "@/lib/musicTheme";

export default function MusicPlaylistsScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setNote(null);
    try {
      const list = await fetchPlaylists({ token });
      setPlaylists(list);
      if (!list.length) setNote("Playlists API not available yet — check back soon.");
    } catch (e) {
      setPlaylists([]);
      setNote(e instanceof Error ? e.message : "Could not load playlists");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const playList = async (item: MusicPlaylist) => {
    const { tracks } = await fetchPlaylist(item.id, { token });
    if (tracks.length) {
      await setQueue(tracks, 0);
      router.push("/music/now-playing");
    } else {
      router.push(`/music/playlist/${item.id}`);
    }
  };

  return (
    <MusicShell showNav>
      {loading ? (
        <ActivityIndicator color={musicTheme.orange} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.note}>{note ?? "No playlists yet."}</Text>
          }
          renderItem={({ item }) => {
            const cover = absoluteMusicUrl(item.cover_url);
            return (
              <Pressable
                style={styles.row}
                onPress={() => router.push(`/music/playlist/${item.id}`)}
              >
                {cover ? (
                  <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />
                ) : (
                  <View style={[styles.cover, styles.coverFb]}>
                    <Feather name="list" size={22} color={musicTheme.muted} />
                  </View>
                )}
                <View style={styles.meta}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.count}>
                    {item.track_count ?? 0} track{(item.track_count ?? 0) === 1 ? "" : "s"}
                  </Text>
                </View>
                <Pressable style={styles.playBtn} onPress={() => void playList(item)}>
                  <Feather name="play" size={16} color={musicTheme.white} />
                  <Text style={styles.playText}>Play</Text>
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
    </MusicShell>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  note: { color: musicTheme.muted, textAlign: "center", marginTop: 40, paddingHorizontal: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: musicTheme.line,
  },
  cover: { width: 56, height: 56, borderRadius: 10, backgroundColor: musicTheme.surface },
  coverFb: { alignItems: "center", justifyContent: "center" },
  meta: { flex: 1, minWidth: 0 },
  title: { color: musicTheme.white, fontWeight: "800", fontSize: 16 },
  count: { color: musicTheme.muted, fontSize: 12, marginTop: 2 },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: musicTheme.orange,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  playText: { color: musicTheme.white, fontWeight: "800", fontSize: 12 },
});