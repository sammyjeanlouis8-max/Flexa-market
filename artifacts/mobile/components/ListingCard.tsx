import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React from "react";
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { HOME_METRICS, homeCardWidth } from "@/constants/layoutMetrics";
import type { Listing } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/mediaUrl";

const WIN_W = Dimensions.get("window").width;
const CARD_WIDTH = homeCardWidth(WIN_W);
const IMAGE_HEIGHT = Math.round(CARD_WIDTH * HOME_METRICS.imageAspect);

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
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={openListing}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      testID={`listing-card-${item.id}`}
    >
      <View style={styles.imageContainer}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            contentFit="cover"
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
      <View style={styles.info}>
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
    width: CARD_WIDTH,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    marginBottom: HOME_METRICS.columnGap / 2,
    backgroundColor: "#FFFFFF",
  },
  pressed: { opacity: 0.92 },
  // Web: listing-card-media aspect-square + object-cover
  imageContainer: {
    width: "100%",
    height: IMAGE_HEIGHT,
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
  info: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 8, gap: 2 },
  title: { fontSize: 13, fontWeight: "700", color: "#0F172A", lineHeight: 17 },
  price: { fontSize: 15, fontWeight: "800", color: "#0F172A", marginTop: 1 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 },
  location: { fontSize: 11, color: "#94A3B8", flexShrink: 1 },
  stock: { fontSize: 11, color: "#2563EB", fontWeight: "600" },
});
