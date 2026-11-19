/**
 * Native Home promo strip — matches WebView VideoPromoSection:
 * ≤2 newest eligible cards side-by-side, poster only (no autoplay).
 * Tap opens /videos/watch at that id so the user can scroll the full feed.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import {
  HOME_PROMO_VIDEO_CARD_LIMIT,
  HOME_PROMO_VIDEO_PREVIEW_QUERY_LIMIT,
  selectHomePromoVideos,
} from "@/lib/homePromoVideos";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { fetchVideosFeed, type PromoVideo } from "@/lib/videosApi";

type StripVideo = PromoVideo & {
  boostEndAt?: string | null;
  boostStartAt?: string | null;
  createdAt?: string | null;
};

export function HomePromoVideoStrip() {
  const router = useRouter();
  const { token } = useAuth();
  const { country, isReady } = useMarketplace();
  const [videos, setVideos] = useState<StripVideo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isReady) return;
    try {
      // Prefer country-scoped newest feed; fall back like All Videos hub.
      let data = await fetchVideosFeed(
        {
          country,
          page: 1,
          limit: Math.max(HOME_PROMO_VIDEO_PREVIEW_QUERY_LIMIT, 12),
          sort: "new",
        },
        { token },
      );
      if ((!data.videos || data.videos.length === 0) && country) {
        data = await fetchVideosFeed(
          { page: 1, limit: 12, sort: "new" },
          { token },
        );
      }
      if (token && (!data.videos || data.videos.length === 0)) {
        data = await fetchVideosFeed(
          { country, page: 1, limit: 12, sort: "new" },
          { token: null },
        );
        if ((!data.videos || data.videos.length === 0) && country) {
          data = await fetchVideosFeed(
            { page: 1, limit: 12, sort: "new" },
            { token: null },
          );
        }
      }
      const ranked = selectHomePromoVideos(
        data.videos as StripVideo[],
        HOME_PROMO_VIDEO_CARD_LIMIT,
      );
      setVideos(ranked);
    } catch {
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, [country, isReady, token]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 2 * 60_000);
    return () => clearInterval(poll);
  }, [load]);

  const openVideo = (item: StripVideo) => {
    router.push({
      pathname: "/videos/watch",
      params: {
        id: String(item.listingId || item.id),
        videoUrl: item.videoUrl || "",
        title: item.title || "",
        thumb: item.thumbnail || item.thumbnailUrl || "",
        sellerId: item.sellerId != null ? String(item.sellerId) : "",
        isVideoOnly: item.isVideoOnly ? "1" : "0",
        // Home strip never autoplays; watch feed plays the focused card after tap.
        autoplay: "1",
        fromHome: "1",
      },
    } as any);
  };

  const cards = videos.slice(0, HOME_PROMO_VIDEO_CARD_LIMIT);

  if (loading) {
    return (
      <View
        style={styles.section}
        testID="home-promo-video-strip"
        accessibilityLabel="Video Promo"
      >
        <View style={styles.row}>
          {Array.from({ length: HOME_PROMO_VIDEO_CARD_LIMIT }).map((_, i) => (
            <View key={`promo-skel-${i}`} style={styles.skeleton} testID="home-promo-video-skeleton">
              <ActivityIndicator color="#FFFFFF" />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (cards.length === 0) return null;

  return (
    <View
      style={styles.section}
      testID="home-promo-video-strip"
      accessibilityLabel="Video Promo"
      accessibilityValue={{ text: `${cards.length}/${HOME_PROMO_VIDEO_CARD_LIMIT}` }}
    >
      <View style={styles.row}>
        {cards.map((v) => {
          const thumb =
            resolveMediaUrl(v.thumbnail || v.thumbnailUrl || v.posterUrl) ||
            v.thumbnail ||
            null;
          return (
            <Pressable
              key={`promo-video-${v.id}`}
              style={styles.card}
              onPress={() => openVideo(v)}
              accessibilityLabel={`Play promo ${v.title || v.id}`}
              testID={`button-promo-video-${v.id}`}
            >
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Feather name="film" size={28} color="#94A3B8" />
                </View>
              )}
              <LinearGradient
                colors={["rgba(0,0,0,0.25)", "transparent", "rgba(0,0,0,0.9)"]}
                locations={[0, 0.35, 1]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.playWrap} pointerEvents="none">
                <View style={styles.playBtn}>
                  <Feather name="play" size={18} color="#FFFFFF" />
                </View>
              </View>
              <View style={styles.badges}>
                <View style={styles.badgePrimary}>
                  <Feather name="video" size={10} color="#FFFFFF" />
                  <Text style={styles.badgeText}>Video Promo</Text>
                </View>
                <View style={styles.badgeMuted}>
                  <Text style={styles.badgeText}>Sponsored</Text>
                </View>
              </View>
              <View style={styles.copy}>
                {v.sellerName ? (
                  <Text style={styles.seller} numberOfLines={1}>
                    @{v.sellerName}
                  </Text>
                ) : null}
                <Text style={styles.title} numberOfLines={2}>
                  {v.title || "Sponsored"}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {/* Keep a single card from stretching full width when only one eligible promo. */}
        {cards.length === 1 ? <View style={styles.cardSpacer} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  card: {
    flex: 1,
    minHeight: 360,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  cardSpacer: { flex: 1 },
  skeleton: {
    flex: 1,
    minHeight: 360,
    borderRadius: 16,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: { ...StyleSheet.absoluteFillObject },
  thumbEmpty: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E293B",
  },
  playWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 2,
  },
  badges: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  badgePrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(20,108,67,0.85)",
    borderColor: "rgba(255,255,255,0.25)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeMuted: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderColor: "rgba(255,255,255,0.25)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  copy: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  seller: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "600", marginBottom: 2 },
  title: { color: "#FFFFFF", fontSize: 13, fontWeight: "800", lineHeight: 16 },
});

export default HomePromoVideoStrip;
