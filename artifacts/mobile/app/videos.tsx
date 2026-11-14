/**
 * Promotional Videos hub — matches Sammy mockup:
 * compact green header + All Videos | Boost | My Videos
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import {
  fetchVideosFeed,
  formatDuration,
  type PromoVideo,
} from "@/lib/videosApi";
import { resolveMediaUrl } from "@/lib/mediaUrl";

type HubTab = "all" | "boost" | "mine";

export default function VideosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { country } = useMarketplace();
  const params = useLocalSearchParams<{ tab?: string }>();
  const initial: HubTab =
    params.tab === "mine" ? "mine" : params.tab === "boost" ? "boost" : "all";
  const [tab, setTab] = useState<HubTab>(initial);
  const [videos, setVideos] = useState<PromoVideo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const sort = tab === "mine" ? "mine" : "all";

  const load = useCallback(
    async (mode: "initial" | "refresh" | "more" = "initial") => {
      if (tab === "boost") return;
      if (mode === "refresh") setRefreshing(true);
      if (mode === "more") setLoadingMore(true);
      try {
        if (tab === "mine" && !token) {
          setVideos([]);
          setError(null);
          return;
        }
        const nextPage = mode === "more" ? page + 1 : 1;
        let data = await fetchVideosFeed(
          { country, page: nextPage, limit: 20, sort },
          { token },
        );
        // If country-scoped feed is empty, retry without country (same as web All Videos).
        if (mode !== "more" && (!data.videos || data.videos.length === 0) && country) {
          data = await fetchVideosFeed(
            { page: nextPage, limit: 20, sort },
            { token },
          );
        }
        // Auth can filter out eligible public promotions for some buyers; fall back to guest feed for All Videos.
        if (
          mode !== "more" &&
          sort === "all" &&
          token &&
          (!data.videos || data.videos.length === 0)
        ) {
          data = await fetchVideosFeed(
            { country, page: nextPage, limit: 20, sort },
            { token: null },
          );
          if ((!data.videos || data.videos.length === 0) && country) {
            data = await fetchVideosFeed(
              { page: nextPage, limit: 20, sort },
              { token: null },
            );
          }
        }
        setVideos((prev) =>
          mode === "more" ? [...(prev ?? []), ...data.videos] : data.videos,
        );
        setPage(nextPage);
        setHasMore(data.hasMore);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load videos");
        setVideos((p) => p ?? []);
      } finally {
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [country, token, page, sort, tab],
  );

  useFocusEffect(
    useCallback(() => {
      if (tab === "boost") {
        router.replace("/boost-video" as any);
        setTab("all");
        return;
      }
      if (tab === "mine") {
        router.replace("/my-videos" as any);
        return;
      }
      void load("initial");
    }, [tab, country, token]),
  );

  const tabs = useMemo(
    () =>
      [
        { id: "all" as const, label: "All Videos" },
        { id: "boost" as const, label: "Boost" },
        { id: "mine" as const, label: "My Videos" },
      ] as const,
    [],
  );

  const openVideo = (item: PromoVideo) => {
    router.push({
      pathname: "/videos/watch",
      params: {
        id: String(item.listingId || item.id),
        videoUrl: item.videoUrl || "",
        title: item.title || "",
        thumb: item.thumbnail || "",
        sellerId: item.sellerId != null ? String(item.sellerId) : "",
        isVideoOnly: item.isVideoOnly ? "1" : "0",
        autoplay: "0",
      },
    } as any);
  };

  const renderItem = ({ item }: { item: PromoVideo }) => {
    const thumb = resolveMediaUrl(item.thumbnail || item.thumbnailUrl) || item.thumbnail;
    const dur = formatDuration(item.durationSec);
    return (
      <Pressable
        style={styles.card}
        onPress={() => openVideo(item)}
        accessibilityLabel={`Play ${item.title || "video"}`}
        testID={`promo-video-${item.id}`}
      >
        <View style={styles.thumbWrap}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]}>
              <Feather name="film" size={28} color="#94A3B8" />
            </View>
          )}
          <View style={styles.sponsored}>
            <Text style={styles.sponsoredText}>Sponsored</Text>
          </View>
          <View style={styles.playBtn}>
            <Feather name="play" size={18} color="#FFFFFF" />
          </View>
          {!!dur && (
            <View style={styles.duration}>
              <Text style={styles.durationText}>{dur}</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={styles.iconBtn}
          accessibilityLabel="Go back"
          testID="promo-videos-back"
        >
          <Feather name="arrow-left" size={20} color="#FFFFFF" />
        </Pressable>
        <View style={styles.brandRow}>
          <Feather name="shopping-bag" size={16} color="#FFFFFF" />
          <Text style={styles.brand}>Flexa Market</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>Promotional Videos</Text>
        <View style={styles.tabRow}>
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => {
                  if (t.id === "boost") {
                    router.push("/boost-video" as any);
                    return;
                  }
                  if (t.id === "mine") {
                    if (!token) {
                      router.push("/auth/login" as any);
                      return;
                    }
                    router.push("/my-videos" as any);
                    return;
                  }
                  setTab("all");
                }}
                hitSlop={10}
                style={[styles.tab, active && styles.tabActive]}
                testID={`promo-tab-${t.id}`}
              >
                <Text
                  style={[styles.tabText, active && styles.tabTextActive]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {videos === null && !error ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.flexaGreen} />
          </View>
        ) : (
          <FlatList
            data={videos ?? []}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void load("refresh")}
                tintColor={colors.flexaGreen}
              />
            }
            onEndReached={() => {
              if (hasMore && !loadingMore) void load("more");
            }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator color={colors.flexaGreen} style={{ marginVertical: 16 }} />
              ) : null
            }
            ListEmptyComponent={
              <Text style={styles.empty}>{error || "No promotional videos right now."}</Text>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.flexaGreen },
  header: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  brand: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  body: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  tab: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.flexaGreen,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  tabActive: {
    borderWidth: 2.5,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.flexaGreen,
  },
  tabTextActive: { fontWeight: "800" },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  card: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0F172A",
    marginBottom: 4,
  },
  thumbWrap: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#0F172A" },
  thumb: { width: "100%", height: "100%" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  sponsored: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sponsoredText: { fontSize: 10, fontWeight: "600", color: "#64748B" },
  playBtn: {
    position: "absolute",
    alignSelf: "center",
    top: "42%",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    left: "50%",
    marginLeft: -22,
  },
  duration: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", color: "#64748B", marginTop: 48, fontSize: 13 },
});
