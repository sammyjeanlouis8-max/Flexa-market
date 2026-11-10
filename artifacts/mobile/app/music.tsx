/**
 * Native Flexa Music discovery — free listening only (no purchase CTAs).
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useMusicPlayer } from "@/context/MusicPlayerContext";
import { fetchMusicTracks, musicCoverUri, type MusicTrack } from "@/lib/musicApi";

const GENRES = ["", "kompa", "rap", "gospel", "zouk", "rara", "jazz", "pop"];

export default function FlexaMusicScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const { t } = useLanguage();
  const { playTrack, current, isPlaying, togglePlay } = useMusicPlayer();
  const [tracks, setTracks] = useState<MusicTrack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("");

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") setRefreshing(true);
      try {
        const rows = await fetchMusicTracks({
          token,
          search: search.trim() || undefined,
          genre: genre || undefined,
          limit: 80,
        });
        setTracks(rows);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("musicLoadErr"));
        setTracks((prev) => prev ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token, search, genre, t],
  );

  useFocusEffect(
    useCallback(() => {
      void load("initial");
    }, [load]),
  );

  React.useEffect(() => {
    void load("initial");
  }, [genre]); // eslint-disable-line react-hooks/exhaustive-deps -- reload when genre chip changes

  const featured = useMemo(() => (tracks ?? []).filter((x) => x.is_featured).slice(0, 8), [tracks]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>{t("musicTitle")}</Text>
        <Pressable style={styles.back} onPress={() => router.push("/music/upload")}>
          <Feather name="upload" size={20} color="#0F172A" />
        </Pressable>
      </View>

      <Text style={styles.banner}>{t("musicBanner")}</Text>

      <View style={styles.searchRow}>
        <Feather name="search" size={16} color="#64748B" />
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => void load("initial")}
          placeholder={t("musicSearch")}
          placeholderTextColor="#94A3B8"
          returnKeyType="search"
        />
        <Pressable onPress={() => void load("initial")}>
          <Text style={styles.go}>{t("search")}</Text>
        </Pressable>
      </View>

      <FlatList
        horizontal
        data={GENRES}
        keyExtractor={(g) => g || "all"}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.chip, genre === item && styles.chipOn]}
            onPress={() => {
              setGenre(item);
            }}
          >
            <Text style={[styles.chipText, genre === item && styles.chipTextOn]}>
              {item ? item : t("allCategories")}
            </Text>
          </Pressable>
        )}
      />

      {tracks === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tracks ?? []}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor="#F97316" />
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100, gap: 10 }}
          ListHeaderComponent={
            featured.length ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.section}>{t("musicFeatured")}</Text>
                <FlatList
                  horizontal
                  data={featured}
                  keyExtractor={(item) => `f-${item.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10 }}
                  renderItem={({ item }) => {
                    const cover = musicCoverUri(item);
                    return (
                      <Pressable
                        style={styles.featureCard}
                        onPress={() => void playTrack(item, tracks ?? [item])}
                      >
                        {cover ? (
                          <Image source={{ uri: cover }} style={styles.featureCover} contentFit="cover" />
                        ) : (
                          <View style={[styles.featureCover, styles.coverFallback]}>
                            <Feather name="music" size={28} color="#fff" />
                          </View>
                        )}
                        <Text style={styles.featureTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.featureArtist} numberOfLines={1}>{item.artist || "—"}</Text>
                      </Pressable>
                    );
                  }}
                />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{error ? t("musicLoadErr") : t("musicEmpty")}</Text>
              {error ? <Text style={styles.emptyHint}>{error}</Text> : null}
            </View>
          }
          renderItem={({ item }) => {
            const cover = musicCoverUri(item);
            const active = current?.id === item.id;
            return (
              <Pressable
                style={styles.row}
                onPress={() => router.push(`/music/${item.id}`)}
                onLongPress={() => void playTrack(item, tracks ?? [item])}
              >
                {cover ? (
                  <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />
                ) : (
                  <View style={[styles.cover, styles.coverFallback]}>
                    <Feather name="music" size={18} color="#fff" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>
                    {item.artist || "—"}
                    {item.genre ? ` · ${item.genre}` : ""}
                  </Text>
                </View>
                <Pressable
                  style={styles.playBtn}
                  onPress={() => {
                    if (active) void togglePlay();
                    else void playTrack(item, tracks ?? [item]);
                  }}
                >
                  <Feather
                    name={active && isPlaying ? "pause" : "play"}
                    size={18}
                    color="#fff"
                  />
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
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
  go: { color: "#F97316", fontWeight: "800", fontSize: 13 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#64748B", textTransform: "capitalize" },
  chipTextOn: { color: "#fff" },
  section: { fontWeight: "800", color: "#0F172A", marginBottom: 8, fontSize: 15 },
  featureCard: { width: 120 },
  featureCover: { width: 120, height: 120, borderRadius: 12, marginBottom: 6 },
  featureTitle: { fontWeight: "800", color: "#0F172A", fontSize: 12 },
  featureArtist: { color: "#64748B", fontSize: 11 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
  },
  cover: { width: 52, height: 52, borderRadius: 10 },
  coverFallback: { backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" },
  trackTitle: { fontWeight: "800", color: "#0F172A", fontSize: 14 },
  trackArtist: { color: "#64748B", fontSize: 12, marginTop: 2 },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { alignItems: "center", padding: 32, gap: 8 },
  emptyTitle: { fontWeight: "800", color: "#0F172A", fontSize: 16 },
  emptyHint: { color: "#64748B", textAlign: "center" },
});
