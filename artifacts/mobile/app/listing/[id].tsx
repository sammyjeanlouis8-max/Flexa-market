import {
  getGetListingQueryKey,
  useGetListing,
} from "@workspace/api-client-react";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { formatListingPrice, listingLocation } from "@/lib/format";

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listingId = Number(id);
  const colors = useColors();
  const router = useRouter();
  const [imageIndex, setImageIndex] = useState(0);

  const enabled = Number.isFinite(listingId) && listingId > 0;
  const { data, isLoading, isError, error, refetch } = useGetListing(
    enabled ? listingId : 0,
    {
      query: {
        queryKey: getGetListingQueryKey(enabled ? listingId : 0),
        enabled,
      },
    },
  );

  const images = data?.images ?? [];
  const activeImage = images[imageIndex] ?? images[0];

  const sellerLine = useMemo(() => {
    if (!data) return "";
    return [
      data.sellerName,
      data.sellerIsVerified ? "verifye" : null,
      data.sellerRating ? `${data.sellerRating.toFixed(1)}★` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [data]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { borderColor: colors.border }]}
        >
          <Text style={{ color: colors.foreground, fontWeight: "600" }}>
            Retounen
          </Text>
        </Pressable>
      </View>

      {!enabled ? (
        <View style={styles.center}>
          <Text style={{ color: colors.foreground }}>Anons pa valid</Text>
        </View>
      ) : isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError || !data ? (
        <View style={styles.center}>
          <Text style={{ color: colors.foreground, fontWeight: "600" }}>
            Pa ka chaje anons lan
          </Text>
          <Text style={{ color: colors.mutedForeground, marginTop: 6 }}>
            {error instanceof Error ? error.message : "Erè"}
          </Text>
          <Pressable
            onPress={() => void refetch()}
            style={[styles.cta, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.ctaText}>Eseye ankò</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.hero, { backgroundColor: "#1E293B" }]}>
            {activeImage ? (
              <Image
                source={{ uri: activeImage }}
                style={styles.heroImage}
                contentFit="cover"
              />
            ) : (
              <Text style={{ color: colors.mutedForeground }}>Pa gen foto</Text>
            )}
          </View>

          {images.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbs}
            >
              {images.map((uri, index) => (
                <Pressable key={`${uri}-${index}`} onPress={() => setImageIndex(index)}>
                  <Image
                    source={{ uri }}
                    style={[
                      styles.thumb,
                      index === imageIndex && {
                        borderColor: colors.primary,
                        borderWidth: 2,
                      },
                    ]}
                    contentFit="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <Text style={[styles.price, { color: colors.primary }]}>
            {formatListingPrice(data.price, data.currency)}
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {data.title}
          </Text>
          <Text style={{ color: colors.mutedForeground }}>
            {listingLocation(data)}
            {data.condition ? ` · ${data.condition}` : ""}
          </Text>
          <Text style={{ color: colors.mutedForeground, marginTop: 4 }}>
            {sellerLine}
          </Text>

          <Text style={[styles.section, { color: colors.foreground }]}>
            Deskripsyon
          </Text>
          <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>
            {data.description || "Pa gen deskripsyon."}
          </Text>

          <Pressable
            onPress={() =>
              router.push({
                pathname: "/website",
                params: {
                  url: `https://flexamarket.com/listings/${data.id}`,
                },
              })
            }
            style={[styles.cta, { backgroundColor: colors.primary, marginTop: 20 }]}
          >
            <Text style={styles.ctaText}>Achte / mesaj (tanporè web)</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { paddingHorizontal: 16, paddingVertical: 8 },
  backBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  content: { paddingBottom: 40, paddingHorizontal: 16, gap: 8 },
  hero: {
    height: 280,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  heroImage: { width: "100%", height: "100%" },
  thumbs: { gap: 8, paddingVertical: 4 },
  thumb: { width: 64, height: 64, borderRadius: 8 },
  price: { fontSize: 26, fontWeight: "800", marginTop: 8 },
  title: { fontSize: 22, fontWeight: "700" },
  section: { marginTop: 16, fontSize: 16, fontWeight: "700" },
  cta: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: { color: "#0F172A", fontWeight: "700", fontSize: 15 },
});
