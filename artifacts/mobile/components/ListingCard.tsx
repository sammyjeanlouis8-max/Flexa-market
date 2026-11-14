import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  HOME_METRICS,
  homeCardWidth,
  homeImageHeight,
} from "@/constants/layoutMetrics";
import type { Listing } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/mediaUrl";

interface ListingCardProps {
  item: Listing;
  onFavoriteToggle?: (id: number, isFav: boolean) => void;
  isFavorited?: boolean;
}

export function ListingCard({
  item,
  onFavoriteToggle,
  isFavorited = false,
}: ListingCardProps) {
  const { width: winW } = useWindowDimensions();
  // Match WebView: square media at the same useful width (169@390, 154@360).
  const cardWidth = homeCardWidth(winW);
  const imageHeight = homeImageHeight(winW);

  const imageUri = resolveMediaUrl(item.images?.[0]);
  const price = Number(item.price || 0);
  const currency =
    item.currency === "HTG" ? "G" : item.currency === "DOP" ? "RD$" : "$";
  const imgCount = item.images?.length ?? 0;

  const openListing = () => {
    const id = String(item.id);
    if (!id || id === "undefined" || id === "null") return;
    router.push({ pathname: "/listing/[id]", params: { id } });
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          width: cardWidth,
          marginBottom: HOME_METRICS.rowGap / 2,
          borderRadius: HOME_METRICS.cardRadius,
        },
        pressed && styles.pressed,
      ]}
      onPress={openListing}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      testID={`listing-card-${item.id}`}
    >
      <View style={[styles.imageContainer, { height: imageHeight }]}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            contentFit={HOME_METRICS.objectFit}
            transition={200}
            recyclingKey={`listing-${item.id}`}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Feather name="image" size={28} color="#94a3b8" />
          </View>
        )}
        {item.isBoosted ? (
          <View style={styles.boostBadge}>
            <Text style={styles.boostText}>Boost</Text>
          </View>
        ) : null}
        {imgCount > 1 ? (
          <View style={styles.countPill}>
            <Text style={styles.countText}>1/{imgCount}</Text>
          </View>
        ) : null}
        {onFavoriteToggle ? (
          <Pressable
            style={styles.favBtn}
            hitSlop={8}
            onPress={(e) => {
              e.stopPropagation?.();
              onFavoriteToggle(item.id, !isFavorited);
            }}
          >
            <Feather
              name="heart"
              size={16}
              color={isFavorited ? "#F97316" : "#FFFFFF"}
            />
          </Pressable>
        ) : null}
      </View>
      <View
        style={[
          styles.info,
          { padding: HOME_METRICS.infoPadding },
        ]}
      >
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.price} numberOfLines={1}>
          {currency}
          {price.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </Text>
        {item.city || item.location ? (
          <View style={styles.locRow}>
            <Feather name="map-pin" size={10} color="#94A3B8" />
            <Text style={styles.location} numberOfLines={1}>
              {item.city || item.location}
            </Text>
          </View>
        ) : null}
        {item.stockQuantity != null ? (
          <Text style={styles.stock} numberOfLines={1}>
            {Number(item.stockQuantity)} available
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  pressed: { opacity: 0.92 },
  // Web: listing-card-media aspect-square + object-cover
  imageContainer: {
    width: "100%",
    backgroundColor: "#F1F5F9",
  },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  boostBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#F97316",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  boostText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  countPill: {
    position: "absolute",
    left: 8,
    bottom: 8,
    backgroundColor: "rgba(15,23,42,0.7)",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  countText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  favBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(15,23,42,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Web .listing-card-info padding: 10px
  info: { gap: 2 },
  title: { fontSize: 14, fontWeight: "700", color: "#0F172A", lineHeight: 18, minHeight: 36 },
  price: { fontSize: 15, fontWeight: "800", color: "#0F172A", marginTop: 1 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 },
  location: { fontSize: 11, color: "#94A3B8", flexShrink: 1 },
  stock: { fontSize: 11, color: "#2563EB", fontWeight: "600" },
});
