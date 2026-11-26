/**
 * Native promo video player — expo-av (no WebView).
 */
import { Feather } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/context/LanguageContext";
import { formatPrice, formatViews } from "@/lib/videosApi";
import colors from "@/constants/colors";

export default function VideoWatchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{
    video?: string;
    url?: string;
    title?: string;
    seller?: string;
    price?: string;
    currency?: string;
    views?: string;
    listingId?: string;
    isVideoOnly?: string;
  }>();
  const videoRef = useRef<Video>(null);

  const videoUrl = useMemo(() => {
    const u = typeof params.url === "string" ? params.url : "";
    return u.trim() || null;
  }, [params.url]);

  const title = typeof params.title === "string" ? params.title : t("videos_title");
  const seller = typeof params.seller === "string" ? params.seller : "";
  const views = Number(params.views ?? 0) || 0;
  const price = Number(params.price ?? 0) || 0;
  const currency = typeof params.currency === "string" ? params.currency : null;
  const listingId = Number(params.listingId || params.video || 0) || 0;
  const isVideoOnly = params.isVideoOnly === "1";
  const priceLabel = formatPrice(price, currency);
  const canBuy = !isVideoOnly && price > 0 && listingId > 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="video-watch-page">
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/videos"))}
        >
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.player}>
        {videoUrl ? (
          <Video
            ref={videoRef}
            source={{ uri: videoUrl }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            useNativeControls
            isLooping
          />
        ) : (
          <View style={styles.missing}>
            <Feather name="alert-circle" size={28} color="#94A3B8" />
            <Text style={styles.missingText}>{t("common_loadFailed")}</Text>
          </View>
        )}
      </View>

      <View style={[styles.info, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title}>{title}</Text>
        {seller ? <Text style={styles.seller}>{seller}</Text> : null}
        <Text style={styles.meta}>
          {formatViews(views)} {t("videos_views")}
        </Text>
        {canBuy ? (
          <Pressable
            style={styles.buy}
            onPress={() => router.push(`/listing/${listingId}` as never)}
          >
            <Feather name="shopping-cart" size={16} color="#fff" />
            <Text style={styles.buyText}>{priceLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0F172A" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  topTitle: {
    flex: 1,
    marginHorizontal: 8,
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  player: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
  },
  video: { width: "100%", height: "100%" },
  missing: { alignItems: "center", gap: 8 },
  missingText: { color: "#94A3B8", fontWeight: "600" },
  info: {
    backgroundColor: "#F8FAFC",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  seller: { marginTop: 4, color: "#64748B", fontWeight: "600", fontSize: 13 },
  meta: { marginTop: 6, color: "#94A3B8", fontSize: 12 },
  buy: {
    marginTop: 14,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.flexaGreen,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buyText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
