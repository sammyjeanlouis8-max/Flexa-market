/**
 * Native promotional videos feed — GET /api/videos/feed
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
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
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { formatMoney } from "@/lib/orderUi";
import { fetchVideosFeed, type PromoVideo } from "@/lib/videosApi";

export default function VideosScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { country } = useMarketplace();
  const [videos, setVideos] = useState<PromoVideo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" | "more" = "initial") => {
      if (mode === "refresh") setRefreshing(true);
      if (mode === "more") setLoadingMore(true);
      try {
        const nextPage = mode === "more" ? page + 1 : 1;
        const data = await fetchVideosFeed(
          { country, page: nextPage, limit: 12, sort: "all" },
          { token },
        );
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
    [country, token, page],
  );

  useFocusEffect(
    useCallback(() => {
      void load("initial");
      // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when marketplace country/session changes
    }, [country, token]),
  );

  const renderItem = ({ item }: { item: PromoVideo }) => {
    const listingId = item.listingId || item.id;
    const thumb = item.thumbnail || item.posterUrl;
    return (
      <Pressable style={styles.card} onPress={() => router.push(`/listing/${listingId}`)}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Feather name="play-circle" size={28} color="#94A3B8" />
          </View>
        )}
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title || `Video #${item.id}`}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {item.sellerName || "Seller"}
            {item.price != null ? ` · ${formatMoney(item.price, item.currency)}` : ""}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Videos" showBrand={false} showBack />
      {videos === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={videos ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={styles.row}
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
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 12, paddingBottom: 40 },
  row: { gap: 10 },
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    overflow: "hidden",
    marginBottom: 10,
  },
  thumb: { width: "100%", aspectRatio: 3 / 4, backgroundColor: "#0F172A" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  meta: { padding: 10 },
  title: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  sub: { marginTop: 4, fontSize: 11, color: "#64748B" },
  empty: { textAlign: "center", color: "#64748B", marginTop: 48 },
});
