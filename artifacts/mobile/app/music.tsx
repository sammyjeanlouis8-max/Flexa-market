/**
 * Flexa Music catalog + playback via global mini player.
 * Purchases remain gated on Android; iOS IAP path is separate (RevenueCat).
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useMusicPlayer } from "@/context/MusicPlayerContext";
import {
  fetchMusicCatalog,
  isMusicPurchaseBlockedOnPlatform,
  type MusicTrack,
} from "@/lib/musicApi";

export default function MusicScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const { track: current, playing, playTrack, toggle } = useMusicPlayer();
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const rows = await fetchMusicCatalog(
          { search: query.trim() || undefined, limit: 40 },
          { token },
        );
        setTracks(rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load music");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [query, token],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  const onPlay = async (item: MusicTrack) => {
    try {
      if (current?.id === item.id) {
        await toggle();
        return;
      }
      await playTrack(item);
    } catch (e) {
      Alert.alert("Playback failed", e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Flexa Music</Text>
        <View style={{ width: 40 }} />
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => void load("initial")}
        placeholder="Search tracks or artists"
        placeholderTextColor="#94A3B8"
        style={styles.search}
        returnKeyType="search"
      />

      {isMusicPurchaseBlockedOnPlatform() ? (
        <Text style={styles.banner}>
          Digital music purchases are unavailable on Android Play builds. Streaming owned/free
          tracks still works.
        </Text>
      ) : null}

      {loading && !refreshing ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor="#F97316"
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={<Text style={styles.empty}>No tracks found</Text>}
          renderItem={({ item }) => {
            const active = current?.id === item.id;
            return (
              <Pressable style={styles.row} onPress={() => void onPlay(item)}>
                {item.coverUrl ? (
                  <Image source={{ uri: item.coverUrl }} style={styles.cover} contentFit="cover" />
                ) : (
                  <View style={[styles.cover, styles.coverEmpty]}>
                    <Feather name="music" size={16} color="#94A3B8" />
                  </View>
                )}
                <View style={styles.meta}>
                  <Text style={styles.trackTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.artist} numberOfLines={1}>
                    {item.artist || "Unknown artist"}
                  </Text>
                </View>
                <Feather
                  name={active && playing ? "pause" : "play"}
                  size={20}
                  color={active ? "#F97316" : "#0F172A"}
                />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  search: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    marginBottom: 10,
    color: "#0F172A",
  },
  banner: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    color: "#9A3412",
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 17,
  },
  error: { color: "#B91C1C", marginBottom: 8 },
  empty: { textAlign: "center", color: "#64748B", marginTop: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
    marginBottom: 8,
  },
  cover: { width: 48, height: 48, borderRadius: 8, backgroundColor: "#E2E8F0" },
  coverEmpty: { alignItems: "center", justifyContent: "center" },
  meta: { flex: 1 },
  trackTitle: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  artist: { fontSize: 12, color: "#64748B" },
});
