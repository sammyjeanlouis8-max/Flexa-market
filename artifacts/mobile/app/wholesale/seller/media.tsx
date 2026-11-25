import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchSellerMedia } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function MediaLibraryScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [photos, setPhotos] = useState<Awaited<ReturnType<typeof fetchSellerMedia>>["photos"]>([]);
  const [videos, setVideos] = useState<Awaited<ReturnType<typeof fetchSellerMedia>>["videos"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSellerMedia({ token });
      setPhotos(data.photos);
      setVideos(data.videos);
    } catch (e: any) {
      setError(e?.message || "Failed to load media");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <WholesaleGate>
      <WholesaleShell title="Media library" subtitle="Photos and videos stored separately per product">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <View style={styles.wrap}>
            <Text style={styles.section}>Photos ({photos.length})</Text>
            <View style={styles.grid}>
              {photos.map((p, i) => (
                <Pressable key={`${p.url}-${i}`} onPress={() => router.push(`/wholesale/seller/products/${p.productId}/edit`)}>
                  <Image source={{ uri: p.url }} style={styles.thumb} contentFit="cover" />
                </Pressable>
              ))}
            </View>
            {photos.length === 0 ? <Text style={styles.empty}>No product photos yet.</Text> : null}
            <Text style={[styles.section, { marginTop: 16 }]}>Videos ({videos.length})</Text>
            <View style={styles.grid}>
              {videos.map((v, i) => (
                <Pressable
                  key={`${v.url}-${i}`}
                  style={[styles.thumb, styles.video]}
                  onPress={() => router.push(`/wholesale/seller/products/${v.productId}/edit`)}
                >
                  <Feather name="video" size={20} color={T.white} />
                </Pressable>
              ))}
            </View>
            {videos.length === 0 ? <Text style={styles.empty}>No product videos yet.</Text> : null}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  section: { fontSize: 13, fontWeight: "800", color: T.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumb: { width: 88, height: 88, borderRadius: 10, backgroundColor: T.mint },
  video: { alignItems: "center", justifyContent: "center", backgroundColor: T.forest },
  empty: { color: T.muted, fontSize: 13 },
  error: { color: T.danger, fontWeight: "700" },
});
