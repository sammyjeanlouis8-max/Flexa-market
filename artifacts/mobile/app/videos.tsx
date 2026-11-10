/**
 * Native promotional video feed — TikTok-style vertical scroll.
 * Home deep-link: /videos?video=:id pins that clip first via ?selected=.
 * Super Admin can preview All Countries without changing profile country.
 */
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PromoVideoCard from "@/components/videos/PromoVideoCard";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import {
  fetchVideosFeed,
  postVideoBuyClick,
  postVideoImpression,
  type PromoVideo,
} from "@/lib/videosApi";

const SCREEN_H = Dimensions.get("window").height;

export default function VideosFeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const { country } = useMarketplace();
  const params = useLocalSearchParams<{ video?: string; sort?: string }>();
  const selectedId = Number(params.video || 0) || 0;

  const [videos, setVideos] = useState<PromoVideo[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [allCountries, setAllCountries] = useState(false);
  const [adminCountry, setAdminCountry] = useState<string | null>(null);
  const seedRef = useRef(Math.floor(Math.random() * 1_000_000));
  const impressed = useRef(new Set<number>());
  const listRef = useRef<FlatList<PromoVideo>>(null);

  const isSuperAdmin = !!user?.isSuperAdmin;

  const feedScope = useMemo(() => {
    if (isSuperAdmin && allCountries) return { allCountries: true as const };
    if (isSuperAdmin && adminCountry) return { country: adminCountry };
    return { country };
  }, [adminCountry, allCountries, country, isSuperAdmin]);

  const videosRef = useRef<PromoVideo[]>([]);
  videosRef.current = videos;

  const load = useCallback(
    async (mode: "initial" | "more" = "initial") => {
      if (mode === "more") {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const nextPage = mode === "more" ? page + 1 : 1;
        const data = await fetchVideosFeed(
          {
            page: nextPage,
            limit: 8,
            seed: seedRef.current,
            sort: (params.sort as any) || "all",
            selected: mode === "initial" && selectedId ? selectedId : undefined,
            exclude:
              mode === "more" ? videosRef.current.map((v) => v.id) : undefined,
            ...feedScope,
          },
          { token },
        );
        const rows = data.videos ?? [];
        setVideos((prev) => (mode === "more" ? [...prev, ...rows] : rows));
        setPage(nextPage);
        setHasMore(!!data.hasMore);
        if (mode === "initial" && selectedId) {
          const idx = rows.findIndex((v) => v.id === selectedId);
          if (idx > 0) {
            setTimeout(() => {
              listRef.current?.scrollToIndex({ index: idx, animated: false });
              setActiveIndex(idx);
            }, 50);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load videos");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [feedScope, hasMore, loadingMore, page, params.sort, selectedId, token],
  );

  useEffect(() => {
    void load("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedScope.country, (feedScope as any).allCountries, selectedId, token]);

  useEffect(() => {
    const current = videos[activeIndex];
    if (!current || impressed.current.has(current.id)) return;
    impressed.current.add(current.id);
    void postVideoImpression(
      current.id,
      { source: "native_feed", country, device: "ios_or_android" },
      { token },
    );
  }, [activeIndex, country, token, videos]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / SCREEN_H);
    if (idx !== activeIndex && idx >= 0 && idx < videos.length) {
      setActiveIndex(idx);
    }
    if (idx >= videos.length - 2) void load("more");
  };

  const onBuy = async (item: PromoVideo) => {
    await postVideoBuyClick(
      item.id,
      { source: "native_feed", country },
      { token },
    );
    router.push(`/listing/${item.id}`);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.topTitle}>Promo videos</Text>
        {isSuperAdmin ? (
          <Pressable
            style={styles.saChip}
            onPress={() => {
              setAllCountries((v) => !v);
              setAdminCountry(null);
            }}
          >
            <Text style={styles.saChipText}>
              {allCountries ? "All countries" : adminCountry || country}
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {loading && videos.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#F97316" />
        </View>
      ) : error && videos.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => load("initial")}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={videos}
          keyExtractor={(item) => String(item.id)}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={SCREEN_H}
          snapToAlignment="start"
          disableIntervalMomentum
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, index) => ({
            length: SCREEN_H,
            offset: SCREEN_H * index,
            index,
          })}
          ListEmptyComponent={
            <View style={[styles.centered, { height: SCREEN_H }]}>
              <Text style={styles.empty}>No active promo videos right now</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color="#F97316" style={{ marginVertical: 16 }} />
            ) : null
          }
          renderItem={({ item, index }) => (
            <PromoVideoCard
              item={item}
              active={index === activeIndex}
              muted={muted}
              bottomInset={insets.bottom}
              onToggleMute={() => setMuted((m) => !m)}
              onBuy={() => void onBuy(item)}
              onOpenListing={() => router.push(`/listing/${item.id}`)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { color: "#fff", fontWeight: "800", fontSize: 16 },
  saChip: {
    backgroundColor: "rgba(249,115,22,0.9)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  saChipText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  error: { color: "#fecaca", textAlign: "center" },
  empty: { color: "rgba(255,255,255,0.8)", textAlign: "center" },
  retry: {
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontWeight: "800" },
});
