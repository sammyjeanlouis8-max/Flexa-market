/**
 * Flexa Music home — premium charcoal/emerald redesign (real API data only).
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MusicShell } from "@/components/music/MusicShell";
import { ArtistChip, TrackTile } from "@/components/music/TrackRow";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  absoluteMusicUrl,
  fetchMusicCatalog,
  fetchTrackLikes,
  toggleTrackLike,
  type MusicTrack,
} from "@/lib/musicApi";
import { playTrack } from "@/lib/musicPlayer";
import { MUSIC_TAB_BAR_CONTENT, musicTheme } from "@/lib/musicTheme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const RECENT_KEY = "flexa_music_recent";
const LIKED_KEY = "flexa_music_liked_ids";
const { width: SCREEN_W } = Dimensions.get("window");
const CAROUSEL_W = SCREEN_W - 32;

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

type ArtistBucket = { name: string; cover: string | null; tracks: MusicTrack[] };

export default function MusicTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { t } = useLanguage();
  const [featured, setFeatured] = useState<MusicTrack[]>([]);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [likedMap, setLikedMap] = useState<Record<number, boolean>>({});
  const [recent, setRecent] = useState<MusicTrack[]>([]);
  const [newReleases, setNewReleases] = useState<MusicTrack[]>([]);
  const [trending, setTrending] = useState<MusicTrack[]>([]);
  const [artists, setArtists] = useState<ArtistBucket[]>([]);
  const [recommended, setRecommended] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const carouselRef = useRef<ScrollView>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [featList, catalog] = await Promise.all([
          fetchMusicCatalog({ featured: true, limit: 8 }, { token }),
          fetchMusicCatalog({ limit: 48 }, { token }),
        ]);
        const heroes = (featList.length ? featList : catalog.slice(0, 4)).filter(Boolean);
        setFeatured(heroes);
        setFeaturedIndex(0);

        const byPlays = [...catalog].sort((a, b) => (b.play_count ?? 0) - (a.play_count ?? 0));
        setTrending(byPlays.filter((t) => (t.play_count ?? 0) > 0).slice(0, 12));

        const byDate = [...catalog].sort((a, b) => {
          const da = a.created_at ? Date.parse(a.created_at) : 0;
          const db = b.created_at ? Date.parse(b.created_at) : 0;
          return db - da;
        });
        setNewReleases(byDate.slice(0, 12));

        const artistMap = new Map<string, ArtistBucket>();
        for (const tr of catalog) {
          const name = (tr.artist || "").trim();
          if (!name) continue;
          const cur = artistMap.get(name);
          if (!cur) {
            artistMap.set(name, { name, cover: tr.cover_url ?? null, tracks: [tr] });
          } else {
            cur.tracks.push(tr);
            if (!cur.cover && tr.cover_url) cur.cover = tr.cover_url;
          }
        }
        setArtists(
          [...artistMap.values()]
            .sort((a, b) => b.tracks.length - a.tracks.length)
            .slice(0, 12),
        );

        const heroIds = new Set(heroes.map((h) => h.id));
        setRecommended(catalog.filter((t) => !heroIds.has(t.id)).slice(0, 12));

        const stored = await AsyncStorage.getItem(RECENT_KEY);
        setRecent(stored ? JSON.parse(stored) : []);

        const likes: Record<number, boolean> = {};
        await Promise.all(
          heroes.slice(0, 4).map(async (h) => {
            try {
              const lk = await fetchTrackLikes(h.id, { token });
              likes[h.id] = lk.liked;
            } catch {
              likes[h.id] = false;
            }
          }),
        );
        setLikedMap(likes);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("music_loadError"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, t],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  const play = async (track: MusicTrack, list?: MusicTrack[]) => {
    const updated = await pushRecent(track);
    setRecent(updated);
    const queue = list?.length ? list : newReleases.length ? newReleases : [track];
    await playTrack(track, queue);
    router.push("/music/now-playing");
  };

  const toggleFavorite = async (track: MusicTrack) => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    try {
      const res = await toggleTrackLike(track.id, { token });
      setLikedMap((m) => ({ ...m, [track.id]: res.liked }));
      const raw = await AsyncStorage.getItem(LIKED_KEY);
      const ids: number[] = raw ? JSON.parse(raw) : [];
      const next = res.liked
        ? [track.id, ...ids.filter((x) => x !== track.id)]
        : ids.filter((x) => x !== track.id);
      await AsyncStorage.setItem(LIKED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const onCarouselScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / CAROUSEL_W);
    if (i !== featuredIndex && i >= 0 && i < featured.length) setFeaturedIndex(i);
  };

  const chips = useMemo(
    () =>
      [
        { key: "trending", label: t("music_chipTrending"), icon: "zap" as const, color: musicTheme.orange, scroll: "trending" },
        { key: "new", label: t("music_chipNew"), icon: "music" as const, color: musicTheme.emerald, scroll: "new" },
        { key: "playlists", label: t("music_chipPlaylists"), icon: "layers" as const, color: musicTheme.emerald, href: "/music/playlists" },
        { key: "charts", label: t("music_chipCharts"), icon: "bar-chart-2" as const, color: musicTheme.emerald, scroll: "trending" },
      ] as const,
    [t],
  );

  const sectionPad = MUSIC_TAB_BAR_CONTENT + Math.max(insets.bottom, 8) + 88;

  return (
    <MusicShell showNav>
      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator color={musicTheme.orange} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.btn} onPress={() => load("refresh")}>
            <Text style={styles.btnText}>{t("music_retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: sectionPad }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load("refresh")}
              tintColor={musicTheme.orange}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {featured.length > 0 ? (
            <View style={styles.carouselBlock}>
              <ScrollView
                ref={carouselRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onCarouselScroll}
                decelerationRate="fast"
              >
                {featured.map((track) => {
                  const cover = absoluteMusicUrl(track.cover_url);
                  const liked = !!likedMap[track.id];
                  return (
                    <View key={track.id} style={[styles.heroCard, { width: CAROUSEL_W }]}>
                      <LinearGradient
                        colors={["#1C2C24", "#0B3D2B", "#101714"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.heroRow}>
                        <View style={styles.heroCopy}>
                          <View style={styles.featuredPill}>
                            <Feather name="star" size={11} color={musicTheme.emerald} />
                            <Text style={styles.featuredPillText}>{t("music_featured")}</Text>
                          </View>
                          <Text style={styles.heroTitle} numberOfLines={2}>
                            {track.title}
                          </Text>
                          <Text style={styles.heroArtist} numberOfLines={1}>
                            {track.artist}
                          </Text>
                          <View style={styles.heroActions}>
                            <Pressable
                              style={styles.playBtn}
                              onPress={() => void play(track, featured)}
                            >
                              <Feather name="play" size={14} color={musicTheme.white} />
                              <Text style={styles.playBtnText}>{t("music_play")}</Text>
                            </Pressable>
                            <Pressable
                              style={styles.favBtn}
                              onPress={() => void toggleFavorite(track)}
                              accessibilityLabel={t("music_favorite")}
                            >
                              <Feather
                                name="heart"
                                size={16}
                                color={liked ? musicTheme.orange : musicTheme.text}
                              />
                            </Pressable>
                          </View>
                        </View>
                        <View style={styles.heroArtWrap}>
                          {cover ? (
                            <Image source={{ uri: cover }} style={styles.heroArt} contentFit="cover" />
                          ) : (
                            <View style={[styles.heroArt, styles.artFallback]}>
                              <Feather name="disc" size={36} color={musicTheme.emerald} />
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
              {featured.length > 1 ? (
                <View style={styles.dots}>
                  {featured.map((tr, i) => (
                    <View
                      key={tr.id}
                      style={[styles.dot, i === featuredIndex && styles.dotOn]}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.chipRow}>
            {chips.map((c) => (
              <Pressable
                key={c.key}
                style={styles.chip}
                onPress={() => {
                  if ("href" in c && c.href) router.push(c.href as any);
                }}
              >
                <Feather name={c.icon} size={18} color={c.color} />
                <Text style={styles.chipLabel}>{c.label}</Text>
              </Pressable>
            ))}
          </View>

          {recent.length > 0 ? (
            <Section
              icon="clock"
              title={t("music_recentlyPlayed")}
              onSeeAll={() => router.push("/music/library")}
              seeAll={t("music_seeAll")}
            >
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {recent.map((tr) => (
                  <TrackTile key={tr.id} track={tr} onPress={() => void play(tr, recent)} />
                ))}
              </ScrollView>
            </Section>
          ) : null}

          {newReleases.length > 0 ? (
            <Section
              icon="award"
              title={t("music_newReleases")}
              onSeeAll={() => router.push("/music/search")}
              seeAll={t("music_seeAll")}
            >
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {newReleases.map((tr) => (
                  <TrackTile key={tr.id} track={tr} onPress={() => void play(tr, newReleases)} />
                ))}
              </ScrollView>
            </Section>
          ) : null}

          {trending.length > 0 ? (
            <Section icon="trending-up" title={t("music_trendingNow")} seeAll={t("music_seeAll")}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {trending.map((tr) => (
                  <TrackTile key={tr.id} track={tr} onPress={() => void play(tr, trending)} />
                ))}
              </ScrollView>
            </Section>
          ) : null}

          {artists.length > 0 ? (
            <Section icon="users" title={t("music_popularArtists")}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {artists.map((a) => (
                  <ArtistChip
                    key={a.name}
                    name={a.name}
                    coverUrl={a.cover}
                    onPress={() => void play(a.tracks[0], a.tracks)}
                  />
                ))}
              </ScrollView>
            </Section>
          ) : null}

          {recommended.length > 0 ? (
            <Section icon="star" title={t("music_recommended")}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {recommended.map((tr) => (
                  <TrackTile key={tr.id} track={tr} onPress={() => void play(tr, recommended)} />
                ))}
              </ScrollView>
            </Section>
          ) : null}

          {!featured.length && !newReleases.length && !trending.length ? (
            <Text style={styles.muted}>{t("music_emptyCatalog")}</Text>
          ) : null}
        </ScrollView>
      )}
    </MusicShell>
  );
}

function Section({
  icon,
  title,
  children,
  seeAll,
  onSeeAll,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  children: React.ReactNode;
  seeAll?: string;
  onSeeAll?: () => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleRow}>
          <Feather name={icon} size={16} color={musicTheme.emerald} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {seeAll && onSeeAll ? (
          <Pressable onPress={onSeeAll}>
            <Text style={styles.seeAll}>{seeAll} ›</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingTop: 4 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  error: { color: musicTheme.text, textAlign: "center", marginBottom: 12 },
  btn: {
    backgroundColor: musicTheme.orange,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
  },
  btnText: { color: musicTheme.white, fontWeight: "800" },
  carouselBlock: { marginBottom: 14 },
  heroCard: {
    height: 168,
    borderRadius: 18,
    overflow: "hidden",
    marginRight: 0,
    borderWidth: 1,
    borderColor: musicTheme.border,
  },
  heroRow: { flex: 1, flexDirection: "row", padding: 16, gap: 12 },
  heroCopy: { flex: 1, justifyContent: "center", gap: 6 },
  featuredPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(21,154,104,0.18)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  featuredPillText: { color: musicTheme.emerald, fontSize: 10, fontWeight: "800" },
  heroTitle: { color: musicTheme.text, fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  heroArtist: { color: musicTheme.muted, fontSize: 13 },
  heroActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: musicTheme.orange,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  playBtnText: { color: musicTheme.white, fontWeight: "800", fontSize: 13 },
  favBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: musicTheme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  heroArtWrap: { justifyContent: "center" },
  heroArt: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 3,
    borderColor: musicTheme.emerald,
    backgroundColor: musicTheme.card,
  },
  artFallback: { alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: musicTheme.border },
  dotOn: { backgroundColor: musicTheme.orange, width: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: {
    width: (SCREEN_W - 32 - 24) / 4,
    aspectRatio: 1,
    backgroundColor: musicTheme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: musicTheme.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 6,
  },
  chipLabel: { color: musicTheme.text, fontSize: 9, fontWeight: "700", textAlign: "center" },
  section: { marginTop: 18 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { color: musicTheme.text, fontSize: 16, fontWeight: "800" },
  seeAll: { color: musicTheme.orange, fontWeight: "700", fontSize: 13 },
  muted: { color: musicTheme.muted, textAlign: "center", marginTop: 40 },
});
