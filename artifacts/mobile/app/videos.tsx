import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Dimensions, FlatList, Platform, StyleSheet,
  Text, TouchableOpacity, View, ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");

interface VideoItem {
  id: number;
  url?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  title?: string;
  description?: string;
  listingId?: number;
  listing?: { id: number; title: string; price: number; images?: string[] };
  viewCount?: number;
}

function VideoCard({ item }: { item: VideoItem }) {
  const colors = useColors();
  const thumb = item.thumbnailUrl ?? item.listing?.images?.[0];
  const title = item.title ?? item.listing?.title ?? "";
  const price = item.listing?.price;
  const listingId = item.listingId ?? item.listing?.id;

  return (
    <View style={[styles.videoCard, { backgroundColor: "#0f172a" }]}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          <Feather name="video" size={48} color="#334155" />
        </View>
      )}

      <View style={[StyleSheet.absoluteFill, styles.gradient]} />

      {(item.viewCount ?? 0) > 0 && (
        <View style={styles.viewBadge}>
          <Feather name="eye" size={12} color="#FFF" />
          <Text style={styles.viewCount}>{item.viewCount}</Text>
        </View>
      )}

      <View style={styles.bottomInfo}>
        <View style={styles.playCircle}>
          <Feather name="play" size={28} color="#FFF" />
        </View>
        {title ? <Text style={styles.videoTitle} numberOfLines={2}>{title}</Text> : null}
        {price != null && (
          <Text style={styles.videoPrice}>${Number(price).toFixed(2)}</Text>
        )}
        {listingId && (
          <TouchableOpacity
            style={styles.buyBtn}
            onPress={() => router.push(`/listing/${listingId}`)}
          >
            <Feather name="shopping-bag" size={14} color="#FFF" />
            <Text style={styles.buyBtnText}>Wè Annons</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function VideosScreen() {
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const fetchVideos = useCallback(async () => {
    try {
      const data = await request<{ videos?: VideoItem[] } | VideoItem[]>("/videos/feed?limit=20");
      const list = Array.isArray(data) ? data : (data as any).videos ?? [];
      setVideos(list);
    } catch { setVideos([]); }
  }, [request]);

  useEffect(() => { fetchVideos().finally(() => setLoading(false)); }, [fetchVideos]);

  if (loading) {
    return <View style={[styles.center, { backgroundColor: "#000" }]}><ActivityIndicator color="#FFF" size="large" /></View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vidéos Promo</Text>
      </View>

      {videos.length === 0 ? (
        <View style={styles.center}>
          <Feather name="video" size={52} color="#475569" />
          <Text style={{ color: "#94A3B8", fontSize: 16, fontFamily: "Inter_500Medium", marginTop: 8 }}>
            Okenn vidéo disponib
          </Text>
          <Text style={{ color: "#64748B", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 }}>
            Annons avèk vidéo ap parèt la
          </Text>
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(v) => String(v.id)}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={SCREEN_H}
          decelerationRate="fast"
          renderItem={({ item }) => <VideoCard item={item} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  header: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { color: "#FFF", fontSize: 20, fontFamily: "Inter_700Bold" },
  videoCard: { width: SCREEN_W, height: SCREEN_H },
  gradient: { backgroundColor: "rgba(0,0,0,0.25)" },
  viewBadge: { position: "absolute", top: 80, right: 16, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  viewCount: { color: "#FFF", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  playCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  bottomInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 50, gap: 8 },
  videoTitle: { color: "#FFF", fontSize: 16, fontFamily: "Inter_600SemiBold", lineHeight: 22 },
  videoPrice: { color: "#F59E0B", fontSize: 22, fontFamily: "Inter_700Bold" },
  buyBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F97316", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, alignSelf: "flex-start" },
  buyBtnText: { color: "#FFF", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
