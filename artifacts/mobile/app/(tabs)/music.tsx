/**
 * Flexa Music home — native shell (no WebView).
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { MusicShell } from "@/components/music/MusicShell";
import { TrackTile } from "@/components/music/TrackRow";
import { useAuth } from "@/context/AuthContext";
import {
  absoluteMusicUrl,
  fetchMusicCatalog,
  fetchTrackLikes,
  toggleTrackLike,
  type MusicTrack,
} from "@/lib/musicApi";
import { playTrack } from "@/lib/musicPlayer";
import { musicTheme } from "@/lib/musicTheme";

const RECENT_KEY = "flexa_music_recent";
const LIKED_KEY = "flexa_music_liked_ids";

async function pushRecent(track: MusicTrack) {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    const list: MusicTrack[] = raw ? JSON.parse(raw) : [];
    const next = [track, ...list.filter((t) => t.id !== track.id)].slice(0, 24);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export default function MusicTab() {
  const router = useRouter();
  const { token } = useAuth();
  const [featured, setFeatured] = useState<MusicTrack | null>(null);
  const [recent, setRecent] = useState<MusicTrack[]>([]);
  const [newReleases, setNewReleases] = useState<MusicTrack[]>([]);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [featList, catalog] = await Promise.all([
          fetchMusicCatalog({ featured: true, limit: 1 }, { token }),
          fetchMusicCatalog({ limit: 30 }, { token }),
        ]);
        const hero = featList[0] ?? catalog[0] ?? null;
        setFeatured(hero);
        setNewReleases(catalog.slice(0, 12));
        const stored = await AsyncStorage.getItem(RECENT_KEY);
        setRecent(stored ? JSON.parse(stored) : []);
        if (hero && token) {
          const lk = await fetchTrackLikes(hero.id, { token });
          setLiked(lk.liked);
          setLikeCount(lk.count);
        } else if (hero) {
          const lk = await fetchTrackLikes(hero.id, {});
          setLikeCount(lk.count);
          setLiked(false);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load music");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  const play = async (track: MusicTrack, list?: MusicTrack[]) => {
    const updated = await pushRecent(track);
    setRecent(updated);
    await playTrack(track, list ?? newReleases.length ? newReleases : [track]);
    router.push("/music/now-playing");
  };

  const toggleFavorite = async () => {
    if (!featured || !token) {
      router.push("/auth/login");
      return;
    }
    try {
      const res = await toggleTrackLike(featured.id, { token });
      setLiked(res.liked);
      setLikeCount(res.count);
      const raw = await AsyncStorage.getItem(LIKED_KEY);
      const ids: number[] = raw ? JSON.parse(raw) : [];
      const next = res.liked
        ? [featured.id, ...ids.filter((x) => x !== featured.id)]
        : ids.filter((x) => x !== featured.id);
      await AsyncStorage.setItem(LIKED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const cover = featured ? absoluteMusicUrl(featured.cover_url) : null;

  // Global bottom tabs stay visible on this screen — hide MusicShell's own nav
  // so we keep a single marketplace tab bar (Explore/Library live on stack routes).
  return (
    <MusicShell
      showNav={false}
      headerRight={
        <Pressable onPress={() => router.push("/music/search")} hitSlop={12}>
          <Feather name="search" size={22} color={musicTheme.white} />
        </Pressable>
      }
    >
      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator color={musicTheme.orange} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.btn} onPress={() => load("refresh")}>
            <Text style={styles.btnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load("refresh")} tintColor={musicTheme.orange} />
          }
        >
          <Text style={styles.sectionLabel}>Featured</Text>
          {featured ? (
            <View style={styles.hero}>
              {cover ? (
                <Image source={{ uri: cover }} style={styles.heroArt} contentFit="cover" />
              ) : (
                <View style={[styles.heroArt, styles.artFallback]}>
                  <Feather name="award" size={40} color={musicTheme.orange} />
                </View>
              )}
              <View style={styles.heroMeta}>
                <Text style={styles.heroTitle}>{featured.title}</Text>
                <Text style={styles.heroArtist}>{featured.artist}</Text>
                <View style={styles.heroActions}>
                  <Pressable style={styles.playBtn} onPress={() => void play(featured, newReleases)}>
                    <Feather name="play" size={18} color={musicTheme.white} />
                    <Text style={styles.playBtnText}>Play</Text>
                  </Pressable>
                  <Pressable style={styles.favBtn} onPress={() => void toggleFavorite()}>
                    <Feather
                      name={liked ? "heart" : "heart"}
                      size={18}
                      color={liked ? musicTheme.orange : musicTheme.white}
                    />
                    <Text style={styles.favBtnText}>
                      {liked ? "Saved" : "Favorite"}{likeCount ? ` · ${likeCount}` : ""}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <Text style={styles.muted}>No featured tracks yet.</Text>
          )}

          <View style={styles.sectionHead}>
            <Text style={styles.sectionLabel}>Recently played</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hStrip}>
            {recent.length ? (
              recent.map((t) => (
                <TrackTile key={t.id} track={t} onPress={() => void play(t, recent)} />
              ))
            ) : (
              <Text style={styles.mutedPad}>Play a track to see it here.</Text>
            )}
          </ScrollView>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionLabel}>New releases</Text>
            <View style={styles.sectionLinks}>
              <Pressable onPress={() => router.push("/music/library")}>
                <Text style={styles.link}>Library</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/music/playlists")}>
                <Text style={styles.link}>Playlists</Text>
              </Pressable>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hStrip}>
            {newReleases.map((t) => (
              <TrackTile key={t.id} track={t} onPress={() => void play(t, newReleases)} />
            ))}
          </ScrollView>

          <Pressable style={styles.uploadCta} onPress={() => router.push("/music/upload")}>
            <Feather name="upload-cloud" size={20} color={musicTheme.white} />
            <Text style={styles.uploadCtaText}>Add your music</Text>
          </Pressable>
        </ScrollView>
      )}
    </MusicShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingBottom: 100 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  error: { color: musicTheme.white, textAlign: "center", marginBottom: 12 },
  btn: { backgroundColor: musicTheme.orange, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999 },
  btnText: { color: musicTheme.white, fontWeight: "800" },
  sectionLabel: {
    color: musicTheme.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 10,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLinks: { flexDirection: "row", alignItems: "center", gap: 14 },
  link: { color: musicTheme.orange, fontWeight: "700", fontSize: 13 },
  hero: {
    backgroundColor: musicTheme.forest,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: musicTheme.line,
  },
  heroArt: { width: "100%", height: 200 },
  artFallback: { alignItems: "center", justifyContent: "center", backgroundColor: musicTheme.surface },
  heroMeta: { padding: 16, gap: 6 },
  heroTitle: { color: musicTheme.white, fontSize: 22, fontWeight: "800" },
  heroArtist: { color: musicTheme.muted, fontSize: 14 },
  heroActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: musicTheme.orange,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  playBtnText: { color: musicTheme.white, fontWeight: "800" },
  favBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: musicTheme.line,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  favBtnText: { color: musicTheme.white, fontWeight: "700", fontSize: 13 },
  hStrip: { marginBottom: 4 },
  muted: { color: musicTheme.muted, paddingVertical: 8 },
  mutedPad: { color: musicTheme.muted, paddingRight: 16 },
  uploadCta: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: musicTheme.surface,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: musicTheme.line,
  },
  uploadCtaText: { color: musicTheme.white, fontWeight: "800" },
});