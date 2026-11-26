/**
 * Native Video Discover — promo feed grid (mirrors web VideoDiscover).
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  DiscoverSort,
  DiscoverVideo,
  fetchVideoFeed,
  formatPrice,
  formatViews,
} from "@/lib/videosApi";
import colors from "@/constants/colors";

const SORTS: { key: DiscoverSort; label: string }[] = [
  { key: "all", label: "All" },
  { key: "trending", label: "Trending" },
  { key: "new", label: "New" },
  { key: "mine", label: "My Videos" },
];

export default function VideosDiscoverScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { token, user, isLoading: authLoading } = useAuth();
  const [sort, setSort] = useState<DiscoverSort>("all");
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [videos, setVideos] = useState<DiscoverVideo[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalHint, setTotalHint] = useState(0);
  const seedRef = useRef(Math.floor(Math.random() * 1_000_000) + 1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colGap = 12;
  const pad = 16;
  const colW = (width - pad * 2 - colGap) / 2;

  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(query.trim()), 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const loadPage = useCallback(
    async (p: number, replace: boolean, mode: "initial" | "refresh" | "more" = "initial") => {
      if (mode === "refresh") setRefreshing(true);
      else if (mode === "more") setLoadingMore(true);
      else if (replace) setLoading(true);

      try {
        const country = user?.country ?? null;
        const data = await fetchVideoFeed({
          token,
          page: p,
          sort,
          seed: seedRef.current,
          q: debouncedQ || undefined,
          country: country || undefined,
        });
        if (replace) {
          setVideos(data.videos);
          setTotalHint(data.total ?? data.videos.length + (data.hasMore ? 1 : 0));
        } else {
          setVideos((prev) => {
            const seen = new Set(prev.map((v) => v.id));
            return [...prev, ...data.videos.filter((v) => !seen.has(v.id))];
          });
        }
        setHasMore(data.hasMore);
        setPage(p);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load videos");
        if (replace) setVideos((prev) => prev);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [token, user?.country, sort, debouncedQ],
  );

  useFocusEffect(
    useCallback(() => {
      void loadPage(1, true, "initial");
    }, [loadPage]),
  );

  const onSort = (key: DiscoverSort) => {
    if (key === "mine" && !authLoading && !token) {
      router.push("/auth/login");
      return;
    }
    setSort(key);
  };

  const openWatch = (video: DiscoverVideo) => {
    router.push({
      pathname: "/videos/watch",
      params: {
        video: String(video.id),
        sort,
        seed: String(seedRef.current),
        ...(debouncedQ ? { q: debouncedQ } : {}),
        url: video.videoUrl,
        title: video.title,
        thumb: video.thumbnailUrl ?? "",
        seller: video.sellerName,
        price: String(video.price ?? 0),
        currency: video.currency ?? "",
        views: String(video.viewCount ?? 0),
        listingId: String(video.id),
        isVideoOnly: video.isVideoOnly ? "1" : "0",
      },
    } as never);
  };

  const renderItem = ({ item }: { item: DiscoverVideo }) => {
    const priceLabel = formatPrice(item.price, item.currency);
    const canBuy = !item.isVideoOnly && item.price > 0;
    return (
      <Pressable
        style={[styles.card, { width: colW }]}
        onPress={() => openWatch(item)}
        testID={`video-card-${item.id}`}
      >
        <View style={styles.poster}>
          {item.thumbnailUrl ? (
            <Image source={{ uri: item.thumbnailUrl }} style={styles.posterImg} contentFit="cover" />
          ) : (
            <View style={[styles.posterImg, styles.posterFallback]}>
              <Feather name="film" size={28} color="#94A3B8" />
            </View>
          )}
          <View style={styles.playOverlay}>
            <View style={styles.playBtn}>
              <Feather name="play" size={18} color="#fff" />
            </View>
          </View>
          <View style={styles.sponsored}>
            <Text style={styles.sponsoredText}>Promo</Text>
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.seller} numberOfLines={1}>
          {item.sellerName}
          {item.sellerIsVerified ? " ✓" : ""}
        </Text>
        <View style={styles.metaRow}>
          <Feather name="eye" size={12} color="#64748B" />
          <Text style={styles.meta}>{formatViews(item.viewCount)} views</Text>
        </View>
        {canBuy && priceLabel ? <Text style={styles.price}>{priceLabel}</Text> : null}
      </Pressable>
    );
  };

  const allLabel =
    sort === "all" && totalHint > 0 ? `All (${Math.max(totalHint, videos.length)})` : "All";

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]} testID="video-discover-page">
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <View style={styles.badge}>
          <Feather name="play" size={14} color="#fff" />
        </View>
        <Text style={styles.title} numberOfLines={1}>
          Promotional Videos
        </Text>
        <Pressable style={styles.iconBtn} onPress={() => setSearchOpen((v) => !v)}>
          <Feather name="search" size={20} color="#0F172A" />
        </Pressable>
      </View>

      {searchOpen ? (
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search promotional videos…"
          placeholderTextColor="#94A3B8"
          autoFocus
        />
      ) : null}

      <View style={styles.chips}>
        {SORTS.map((s) => {
          const active = sort === s.key;
          const label = s.key === "all" ? allLabel : s.label;
          return (
            <Pressable
              key={s.key}
              style={[styles.chip, active && styles.chipOn]}
              onPress={() => onSort(s.key)}
              testID={`video-filter-${s.key}`}
            >
              <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading && videos.length === 0 ? (
        <ActivityIndicator color={colors.flexaGreen} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={{ gap: colGap, paddingHorizontal: pad }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: colGap }}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadPage(1, true, "refresh")}
              tintColor={colors.flexaGreen}
            />
          }
          onEndReached={() => {
            if (!loading && !loadingMore && hasMore) void loadPage(page + 1, false, "more");
          }}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            error ? <Text style={styles.error}>{error}</Text> : null
          }
          ListEmptyComponent={
            <View style={styles.empty} testID="video-discover-empty">
              <View style={styles.emptyIcon}>
                <Feather name="film" size={36} color={colors.flexaGreen} />
              </View>
              <Text style={styles.emptyTitle}>
                {sort === "mine"
                  ? "You have no promotional videos"
                  : "No promotional videos yet"}
              </Text>
              <Text style={styles.emptyDesc}>
                {sort === "mine"
                  ? "Boost a product video to appear here while the campaign is active."
                  : "Check back soon — sellers boost products with promo videos."}
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.flexaGreen} style={{ marginVertical: 16 }} />
            ) : null
          }
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
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, fontSize: 16, fontWeight: "800", color: "#0F172A" },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0F172A",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  chipText: { fontWeight: "700", color: "#64748B", fontSize: 12 },
  chipTextOn: { color: "#FFFFFF" },
  error: {
    color: "#B91C1C",
    marginHorizontal: 16,
    marginBottom: 8,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    marginBottom: 4,
  },
  poster: {
    aspectRatio: 3 / 4,
    backgroundColor: "#E2E8F0",
    position: "relative",
  },
  posterImg: { width: "100%", height: "100%" },
  posterFallback: { alignItems: "center", justifyContent: "center" },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 2,
  },
  sponsored: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "#6D28D9",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sponsoredText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    paddingHorizontal: 10,
    paddingTop: 8,
    lineHeight: 17,
  },
  seller: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    paddingHorizontal: 10,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  meta: { fontSize: 11, color: "#64748B" },
  price: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.flexaGreen,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  empty: { alignItems: "center", paddingHorizontal: 32, paddingTop: 48 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A", textAlign: "center" },
  emptyDesc: {
    marginTop: 8,
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
});
