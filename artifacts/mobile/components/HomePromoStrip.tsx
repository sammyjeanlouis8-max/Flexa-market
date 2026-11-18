/**
 * Native Home promo strip — same selection rules as marketplace SPA:
 * 0 videos → nothing; 1 video → companion product (or centered solo);
 * 2+ → two video cards.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ListingCard } from "@/components/ListingCard";
import type { Listing } from "@/lib/api";
import {
  HOME_PROMO_VIDEO_CARD_LIMIT,
  HOME_PROMO_VIDEO_PREVIEW_QUERY_LIMIT,
  selectHomePromoCompanionProduct,
  selectHomePromoVideos,
} from "@/lib/homePromoCompanion";
import { fetchHomePromoVideos, type PromoVideoItem } from "@/lib/videosApi";

const GAP = 12;
const CARD_WIDTH = (Dimensions.get("window").width - GAP * 3) / 2;
const VIDEO_HEIGHT = Math.max(360, CARD_WIDTH * 1.35);

type Props = {
  country: string;
  catalog: Listing[];
  token?: string | null;
};

export function HomePromoStrip({ country, catalog, token }: Props) {
  const router = useRouter();
  const [videos, setVideos] = useState<PromoVideoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await fetchHomePromoVideos(
          country,
          HOME_PROMO_VIDEO_PREVIEW_QUERY_LIMIT,
          { token },
        );
        if (cancelled) return;
        setVideos(selectHomePromoVideos(raw, HOME_PROMO_VIDEO_CARD_LIMIT));
      } catch {
        if (!cancelled) setVideos([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [country, token]);

  const cards = videos.slice(0, HOME_PROMO_VIDEO_CARD_LIMIT);
  const companion = useMemo(() => {
    if (cards.length !== 1) return null;
    return selectHomePromoCompanionProduct(catalog, {
      excludeListingIds: cards.map((v) => v.id),
      activeCountry: country,
    });
  }, [cards, catalog, country]);

  if (loading || cards.length === 0) return null;

  const openVideo = (id: number) => {
    // Native feed is still migrating — open the production promo feed.
    Linking.openURL(`https://flexamarket.com/videos?video=${id}`).catch(() => {
      router.push("/videos");
    });
  };

  const renderVideo = (v: PromoVideoItem) => (
    <Pressable
      key={`promo-${v.id}`}
      onPress={() => openVideo(v.id)}
      style={styles.videoCard}
      accessibilityRole="button"
      accessibilityLabel={`Promotional video ${v.title}`}
      testID={`button-promo-video-${v.id}`}
    >
      {v.thumbnailUrl ? (
        <Image source={{ uri: v.thumbnailUrl }} style={styles.videoImage} contentFit="cover" />
      ) : (
        <View style={[styles.videoImage, styles.videoPlaceholder]}>
          <Feather name="video" size={28} color="#94A3B8" />
        </View>
      )}
      <View style={styles.videoScrim} />
      <View style={styles.playWrap}>
        <View style={styles.playBtn}>
          <Feather name="play" size={18} color="#FFFFFF" />
        </View>
      </View>
      <View style={styles.badgeRow}>
        <Text style={styles.badge}>VIDEO PROMO</Text>
        <Text style={[styles.badge, styles.badgeDark]}>SPONSORED</Text>
      </View>
      <View style={styles.videoMeta}>
        {v.sellerName ? <Text style={styles.seller}>@{v.sellerName}</Text> : null}
        <Text style={styles.videoTitle} numberOfLines={2}>
          {v.title}
        </Text>
      </View>
    </Pressable>
  );

  if (cards.length === 1 && !companion) {
    return (
      <View style={styles.soloWrap} testID="home-promo-video-solo">
        {renderVideo(cards[0])}
      </View>
    );
  }

  return (
    <View
      style={styles.row}
      testID="home-promo-video-strip"
      accessibilityLabel="Video Promo"
    >
      {cards.map(renderVideo)}
      {companion ? (
        <View testID="home-promo-companion-product">
          <ListingCard item={companion} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  soloWrap: {
    alignItems: "center",
    marginBottom: 4,
  },
  videoCard: {
    width: CARD_WIDTH,
    height: VIDEO_HEIGHT,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#0F172A",
    marginBottom: 12,
  },
  videoImage: { width: "100%", height: "100%" },
  videoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E293B",
  },
  videoScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
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
  badgeRow: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  badge: {
    backgroundColor: "rgba(37,99,235,0.85)",
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  badgeDark: { backgroundColor: "rgba(0,0,0,0.45)" },
  videoMeta: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
  },
  seller: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "600", marginBottom: 2 },
  videoTitle: { color: "#fff", fontSize: 13, fontWeight: "800", lineHeight: 17 },
});
