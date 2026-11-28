import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MusicShell } from "@/components/music/MusicShell";
import { TrackListRow } from "@/components/music/TrackRow";
import { useAuth } from "@/context/AuthContext";
import { fetchMusicLibrary, fetchMusicTrack, type MusicTrack } from "@/lib/musicApi";
import {
  clearUnseenSponsoredAdCount,
  readUnseenSponsoredAdCount,
} from "@/lib/musicAdBreak";
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
  const [unseenAds, setUnseenAds] = useState(0);
  const [bannerDismissed, setBannerDismissed] = useState(false);

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
      let fetched: MusicTrack[] = [];
      if (token) {
        try {
          fetched = await fetchMusicLibrary({ token });
        } catch {
          fetched = [];
        }
      }
      if (!fetched.length) {
        for (const id of likedIds.slice(0, 40)) {
          try {
            fetched.push(await fetchMusicTrack(id, { token }));
          } catch {
            /* skip stale */
          }
        }
      }
      setLiked(fetched);
    } catch {
      setLiked([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshUnseen = useCallback(async () => {
    setUnseenAds(await readUnseenSponsoredAdCount());
  }, []);

  useEffect(() => {
    void refreshUnseen();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshUnseen();
    });
    return () => sub.remove();
  }, [refreshUnseen]);

  const play = async (track: MusicTrack, list: MusicTrack[]) => {
    await playTrack(track, list);
    router.push("/music/now-playing");
  };

  return (
    <MusicShell showNav>
      {loading ? (
        <ActivityIndicator color={musicTheme.orange} style={{ marginTop: 32 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {unseenAds > 0 && !bannerDismissed ? (
            <View style={styles.banner}>
              <Pressable
                style={styles.bannerBody}
                onPress={() => router.push("/music/sponsored-ads")}
              >
                <Text style={styles.bannerText}>
                  {unseenAds} ad{unseenAds === 1 ? "" : "s"} you heard in the background
                </Text>
                <Text style={styles.bannerLink}>View</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setBannerDismissed(true);
                  void clearUnseenSponsoredAdCount();
                  setUnseenAds(0);
                }}
                hitSlop={8}
                accessibilityLabel="Dismiss"
              >
                <Text style={styles.bannerDismiss}>×</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable style={styles.sponsoredRow} onPress={() => router.push("/music/sponsored-ads")}>
            <Text style={styles.section}>Recent sponsored ads</Text>
            <Text style={styles.link}>See all</Text>
          </Pressable>

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
  sponsoredRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: musicTheme.forest,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: musicTheme.line,
    marginBottom: 16,
    paddingRight: 10,
  },
  bannerBody: { flex: 1, padding: 14, flexDirection: "row", justifyContent: "space-between" },
  bannerText: { color: musicTheme.white, fontWeight: "700", fontSize: 13, flex: 1 },
  bannerLink: { color: musicTheme.orange, fontWeight: "800", marginLeft: 8 },
  bannerDismiss: { color: musicTheme.muted, fontSize: 22, fontWeight: "600" },
});