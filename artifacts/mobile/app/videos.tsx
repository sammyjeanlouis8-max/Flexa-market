import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { fetchVideosFeed, type PromoVideo } from "@/lib/videosApi";

export default function VideosScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { country } = useMarketplace();
  const [videos, setVideos] = useState<PromoVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchVideosFeed({ country, page: 1, limit: 20 }, { token });
      setVideos(data.videos || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [country, token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.root}>
      <AppHeader title="Promotional Videos" showBrand={false} showBack />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.flexaGreen} />
      ) : error ? (
        <Text style={styles.msg}>{error}</Text>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(v) => String(v.id)}
          contentContainerStyle={{ padding: 12, gap: 12 }}
          ListEmptyComponent={<Text style={styles.msg}>No promo videos for {country}.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => item.listingId && router.push(`/listing/${item.listingId}`)}
            >
              <Image
                source={{ uri: item.thumbnail || item.posterUrl || undefined }}
                style={styles.thumb}
                contentFit="cover"
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title || "Promo video"}
                </Text>
                <Text style={styles.meta}>{item.sellerName || "Seller"}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  msg: { textAlign: "center", color: "#64748B", marginTop: 24 },
  card: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#FFF",
  },
  thumb: { width: 110, height: 90, backgroundColor: "#0F172A" },
  title: { fontWeight: "800", color: "#0F172A", paddingTop: 10 },
  meta: { color: "#64748B", fontSize: 13, paddingBottom: 10 },
});
