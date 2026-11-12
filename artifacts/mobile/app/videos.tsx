/**
 * Promotional videos feed — GET /api/videos/feed (seller mine by default).
 * Native playback via NativeVideoPlayer. Paid boost purchase stays blocked.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeVideoPlayer } from "@/components/NativeVideoPlayer";
import { useAuth } from "@/context/AuthContext";
import { fetchVideosFeed, type VideoFeedItem } from "@/lib/sellerApi";

export default function VideosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<VideoFeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const data = await fetchVideosFeed({ token, sort: "mine" });
        setRows(data);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load videos");
        setRows((prev) => prev ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load("initial");
      return () => setPlayingId(null);
    }, [authLoading, token, router, load]),
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/sell"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Promo videos</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.banner}>
        Browse and preview your promotional videos. Paid boost purchase stays unavailable on
        Android.
      </Text>

      {rows === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={rows ?? []}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor="#F97316"
            />
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={<Text style={styles.empty}>No promo videos yet.</Text>}
          renderItem={({ item }) => {
            const uri = item.videoUrl ? String(item.videoUrl) : "";
            const isPlaying = playingId === item.id && !!uri;
            return (
              <View style={styles.card}>
                <Pressable
                  style={styles.cardRow}
                  onPress={() => {
                    if (!uri) {
                      if (item.listingId) router.push(`/listing/${item.listingId}`);
                      return;
                    }
                    setPlayingId((prev) => (prev === item.id ? null : item.id));
                  }}
                >
                  <Feather name={isPlaying ? "pause" : "video"} size={20} color="#F97316" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.title || `Video #${item.id}`}
                    </Text>
                    <Text style={styles.cardSub}>
                      {uri ? (isPlaying ? "Playing · tap to close" : "Tap to preview") : "No URL"}
                      {item.listingId ? ` · listing #${item.listingId}` : ""}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color="#94A3B8" />
                </Pressable>
                {isPlaying ? (
                  <View style={styles.player}>
                    <NativeVideoPlayer uri={uri} title={item.title || undefined} autoPlay />
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  banner: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "#FFF7ED",
    borderRadius: 10,
    padding: 10,
    color: "#9A3412",
    fontSize: 12,
    lineHeight: 16,
  },
  error: { color: "#DC2626", marginBottom: 8 },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 10,
    overflow: "hidden",
  },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  cardTitle: { fontWeight: "800", color: "#0F172A", fontSize: 14 },
  cardSub: { color: "#64748B", fontSize: 11, marginTop: 2 },
  player: { paddingHorizontal: 8, paddingBottom: 10 },
});
