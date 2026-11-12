/**
 * Public promotional video feed — paginated /api/videos/feed.
 * Viewability drives a single active NativeVideoPlayer (stops previous audio).
 */
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeVideoPlayer } from "@/components/NativeVideoPlayer";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import {
  fetchPromoVideosFeed,
  type PromoVideoHomeItem,
} from "@/lib/api";

export default function PromoFeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { token } = useAuth();
  const { country } = useMarketplace();
  const params = useLocalSearchParams<{ video?: string }>();
  const selectedId = Math.max(0, parseInt(String(params.video ?? "0"), 10) || 0);

  const [rows, setRows] = useState<PromoVideoHomeItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | null>(selectedId || null);
  const listRef = useRef<FlatList<PromoVideoHomeItem>>(null);
  const generationRef = useRef(0);

  const load = useCallback(
    async (p: number, replace: boolean) => {
      const gen = replace ? ++generationRef.current : generationRef.current;
      if (replace) setLoading(true);
      else setLoadingMore(true);
      try {
        const data = await fetchPromoVideosFeed({
          token,
          country,
          page: p,
          limit: 10,
          selected: replace ? selectedId : undefined,
        });
        if (gen !== generationRef.current) return;
        setRows((prev) => (replace ? data.videos : [...prev, ...data.videos]));
        setHasMore(data.hasMore);
        setPage(p);
        setError(null);
        if (replace && data.videos[0]) {
          setActiveId(selectedId > 0 ? selectedId : data.videos[0].id);
        }
      } catch (e) {
        if (gen !== generationRef.current) return;
        setError(e instanceof Error ? e.message : "Could not load promo feed");
      } finally {
        if (gen === generationRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [token, country, selectedId],
  );

  useEffect(() => {
    void load(1, true);
  }, [load]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const top = viewableItems.find((v) => v.isViewable && v.item);
      if (top?.item?.id) setActiveId(Number(top.item.id));
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
  }).current;

  const cardHeight = Math.max(420, height - insets.top - insets.bottom - 56);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
          accessibilityLabel="Back"
        >
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.title}>Promo videos</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading && rows.length === 0 ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : error && rows.length === 0 ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(item) => String(item.id)}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onEndReached={() => {
            if (hasMore && !loadingMore) void load(page + 1, false);
          }}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => {
            const uri = item.videoUrl ? String(item.videoUrl) : "";
            const isActive = activeId === item.id && !!uri;
            return (
              <View style={[styles.card, { height: cardHeight }]}>
                {uri ? (
                  <NativeVideoPlayer
                    uri={uri}
                    title={item.title || undefined}
                    posterUrl={item.thumbnailUrl}
                    productPhotoUrl={item.productPhotoUrl}
                    autoPlay={isActive}
                    active={isActive}
                  />
                ) : (
                  <Text style={styles.missing}>Video unavailable</Text>
                )}
                {item.sellerName ? (
                  <Text style={styles.seller}>@{item.sellerName}</Text>
                ) : null}
              </View>
            );
          }}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color="#F97316" style={{ marginVertical: 16 }} /> : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0F172A" },
  topBar: {
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
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#fff" },
  error: { color: "#FCA5A5", textAlign: "center", marginTop: 40, paddingHorizontal: 24 },
  card: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    justifyContent: "center",
  },
  missing: { color: "#94A3B8", textAlign: "center" },
  seller: { color: "#CBD5E1", marginTop: 8, fontSize: 12, fontWeight: "600" },
});
