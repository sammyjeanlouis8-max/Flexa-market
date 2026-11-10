/**
 * Native Flexa TV — live broadcast, schedule, programs, series, movies.
 * User video upload is admin-only (BLOCKED). No public TV like/comment APIs.
 */
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeVideoPlayer } from "@/components/NativeVideoPlayer";
import { useLanguage } from "@/context/LanguageContext";
import { useMusicPlayer } from "@/context/MusicPlayerContext";
import {
  fetchTvBroadcast,
  fetchTvMovies,
  fetchTvNowPlaying,
  fetchTvPrograms,
  fetchTvSchedule,
  fetchTvSeries,
  postTvHeartbeat,
  recordTvProgramView,
  resolveTvPlayUrl,
  type TvBroadcast,
  type TvMovie,
  type TvProgram,
  type TvSeries,
} from "@/lib/tvApi";

type Tab = "live" | "schedule" | "programs" | "series" | "movies";

const VIEWER_KEY = "flexa_tv_viewer_id";

async function getViewerId(): Promise<string> {
  let id = await AsyncStorage.getItem(VIEWER_KEY);
  if (!id) {
    id = `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(VIEWER_KEY, id);
  }
  return id;
}

export default function FlexaTvScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useLanguage();
  const { pauseForVideo } = useMusicPlayer();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>("live");
  const [query, setQuery] = useState("");
  const [broadcast, setBroadcast] = useState<TvBroadcast | null>(null);
  const [schedule, setSchedule] = useState<TvProgram[]>([]);
  const [programs, setPrograms] = useState<TvProgram[]>([]);
  const [series, setSeries] = useState<TvSeries[]>([]);
  const [movies, setMovies] = useState<TvMovie[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [playing, setPlaying] = useState<{ uri: string; title: string } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [focused, setFocused] = useState(true);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    try {
      const [b, np, sch, prog, ser, mov] = await Promise.all([
        fetchTvBroadcast().catch(() => null),
        fetchTvNowPlaying().catch(() => null),
        fetchTvSchedule().catch(() => []),
        fetchTvPrograms().catch(() => []),
        fetchTvSeries().catch(() => []),
        fetchTvMovies(1).catch(() => []),
      ]);
      setBroadcast(b ?? np);
      setSchedule(sch);
      setPrograms(prog);
      setSeries(ser);
      setMovies(mov);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("tvLoadErr"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void pauseForVideo();
      void load("initial");
      let cancelled = false;
      let timer: ReturnType<typeof setInterval> | undefined;
      void (async () => {
        const viewerId = await getViewerId();
        const beat = async () => {
          try {
            const hb = await postTvHeartbeat(viewerId);
            if (!cancelled && hb.state) {
              setBroadcast((prev) => ({ ...(prev ?? {}), state: hb.state, viewerCount: hb.viewerCount }));
            }
          } catch {
            /* ignore heartbeat failures */
          }
        };
        await beat();
        timer = setInterval(beat, 30000);
      })();
      return () => {
        cancelled = true;
        setFocused(false);
        setPlaying(null);
        if (timer) clearInterval(timer);
      };
    }, [load, pauseForVideo]),
  );

  const liveUrl = useMemo(() => {
    if (!broadcast) return null;
    return resolveTvPlayUrl(broadcast);
  }, [broadcast]);

  const filteredPrograms = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tab === "schedule" ? schedule : programs;
    if (!q) return list;
    return list.filter(
      (p) =>
        p.title?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.seriesTitle?.toLowerCase().includes(q),
    );
  }, [tab, schedule, programs, query]);

  const filteredSeries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return series;
    return series.filter(
      (s) => s.title?.toLowerCase().includes(q) || String(s.description ?? "").toLowerCase().includes(q),
    );
  }, [series, query]);

  const filteredMovies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return movies;
    return movies.filter(
      (m) =>
        m.title?.toLowerCase().includes(q) ||
        String(m.description ?? "").toLowerCase().includes(q) ||
        (m.genres ?? []).some((g) => g.toLowerCase().includes(q)),
    );
  }, [movies, query]);

  const playProgram = async (p: TvProgram) => {
    const uri = resolveTvPlayUrl(p);
    if (!uri) {
      setError(t("tvNoStream"));
      return;
    }
    void pauseForVideo();
    setPlaying({ uri, title: p.title });
    if (p.id) void recordTvProgramView(p.id);
  };

  const playMovie = (m: TvMovie) => {
    const uri = resolveTvPlayUrl(m);
    if (!uri) {
      setError(t("tvNoStream"));
      return;
    }
    void pauseForVideo();
    setPlaying({ uri, title: m.title });
  };

  const onShare = async (title: string) => {
    await Share.share({
      message: `${title} — Flexa TV https://flexamarket.com/tv`,
      url: "https://flexamarket.com/tv",
    });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "live", label: t("tvLive") },
    { id: "schedule", label: t("tvSchedule") },
    { id: "programs", label: t("tvPrograms") },
    { id: "series", label: t("tvSeries") },
    { id: "movies", label: t("tvMovies") },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))}
          accessibilityLabel={t("back")}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>{t("tvTitle")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.banner}>{t("tvBanner")}</Text>

      <View style={styles.searchRow}>
        <Feather name="search" size={16} color="#64748B" />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={t("tvSearch")}
          placeholderTextColor="#94A3B8"
        />
      </View>

      <View style={styles.tabs}>
        {tabs.map((item) => (
          <Pressable
            key={item.id}
            style={[styles.tab, tab === item.id && styles.tabOn]}
            onPress={() => setTab(item.id)}
          >
            <Text style={[styles.tabText, tab === item.id && styles.tabTextOn]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : error && !broadcast && !programs.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t("tvLoadErr")}</Text>
          <Text style={styles.emptyHint}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => void load("initial")}>
            <Text style={styles.retryText}>{t("retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={
            tab === "live"
              ? [{ id: "live" } as any]
              : tab === "series"
                ? filteredSeries
                : tab === "movies"
                  ? filteredMovies
                  : filteredPrograms
          }
          keyExtractor={(item: any, i) => String(item.id ?? item.imdbCode ?? item.title ?? i)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor="#F97316" />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingHorizontal: 16, gap: 12 }}
          ListHeaderComponent={
            tab === "live" && focused && (playing || liveUrl) ? (
              <View style={{ marginBottom: 12 }}>
                <NativeVideoPlayer
                  uri={playing?.uri || liveUrl!}
                  title={playing?.title || broadcast?.programTitle || t("tvLive")}
                  autoPlay
                  onFullscreen={() => setFullscreen(true)}
                />
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>
                    {broadcast?.state === "playing" ? t("tvOnAir") : t("tvIdle")}
                    {typeof broadcast?.viewerCount === "number"
                      ? ` · ${broadcast.viewerCount} ${t("tvViewers")}`
                      : ""}
                  </Text>
                  <Pressable onPress={() => void onShare(playing?.title || broadcast?.programTitle || "Flexa TV")}>
                    <Feather name="share-2" size={18} color="#0F172A" />
                  </Pressable>
                </View>
                <Text style={styles.note}>{t("tvUploadBlocked")}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            tab !== "live" ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>{t("tvEmpty")}</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            if (tab === "live") {
              if (playing || liveUrl) return null;
              return (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>{t("tvNoLive")}</Text>
                  <Text style={styles.emptyHint}>{t("tvBrowseHint")}</Text>
                </View>
              );
            }
            if (tab === "series") {
              const s = item as TvSeries;
              return (
                <View style={styles.card}>
                  {s.thumbnailUrl ? (
                    <Image source={{ uri: String(s.thumbnailUrl) }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbFallback]}>
                      <Feather name="tv" size={22} color="#fff" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{s.title}</Text>
                    {s.description ? (
                      <Text style={styles.cardSub} numberOfLines={2}>{String(s.description)}</Text>
                    ) : null}
                  </View>
                </View>
              );
            }
            if (tab === "movies") {
              const m = item as TvMovie;
              return (
                <Pressable style={styles.card} onPress={() => playMovie(m)}>
                  {m.thumbnailUrl ? (
                    <Image source={{ uri: m.thumbnailUrl }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbFallback]}>
                      <Feather name="film" size={22} color="#fff" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{m.title}</Text>
                    <Text style={styles.cardSub} numberOfLines={2}>
                      {[m.year, m.genres?.join(", ")].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Feather name="play-circle" size={22} color="#F97316" />
                </Pressable>
              );
            }
            const p = item as TvProgram;
            return (
              <Pressable style={styles.card} onPress={() => void playProgram(p)}>
                {p.thumbnailUrl ? (
                  <Image source={{ uri: p.thumbnailUrl }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Feather name="play" size={22} color="#fff" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{p.title}</Text>
                  <Text style={styles.cardSub} numberOfLines={2}>
                    {[p.seriesTitle, p.type, p.durationMinutes ? `${p.durationMinutes}m` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                <Feather name="play-circle" size={22} color="#F97316" />
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={fullscreen && !!playing} animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <View style={[styles.fs, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Pressable style={styles.fsClose} onPress={() => setFullscreen(false)}>
            <Feather name="x" size={24} color="#fff" />
          </Pressable>
          {playing ? (
            <View style={{ width, flex: 1, justifyContent: "center" }}>
              <NativeVideoPlayer uri={playing.uri} title={playing.title} autoPlay />
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, marginBottom: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: "#0F172A" },
  banner: { marginHorizontal: 16, marginBottom: 8, color: "#64748B", fontSize: 13, lineHeight: 18 },
  searchRow: {
    marginHorizontal: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  search: { flex: 1, color: "#0F172A", fontSize: 15 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  tabOn: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  tabText: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  tabTextOn: { color: "#fff" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
  },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  thumbFallback: { backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" },
  cardTitle: { fontWeight: "800", color: "#0F172A", fontSize: 14 },
  cardSub: { color: "#64748B", fontSize: 12, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  meta: { color: "#64748B", fontSize: 12, fontWeight: "600" },
  note: { marginTop: 8, color: "#94A3B8", fontSize: 12 },
  empty: { alignItems: "center", padding: 32, gap: 8 },
  emptyTitle: { fontWeight: "800", color: "#0F172A", fontSize: 16 },
  emptyHint: { color: "#64748B", textAlign: "center" },
  retry: {
    marginTop: 8,
    backgroundColor: "#F97316",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: "#fff", fontWeight: "800" },
  fs: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  fsClose: { position: "absolute", top: 48, right: 16, zIndex: 2, padding: 8 },
});
