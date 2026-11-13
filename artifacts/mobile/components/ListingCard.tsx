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
import type { Listing } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/mediaUrl";

const CARD_WIDTH = (Dimensions.get("window").width - 12 * 3) / 2;

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
  const currency = item.currency === "HTG" ? "G" : item.currency === "DOP" ? "RD$" : "$";

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
              name={isFavorited ? "heart" : "heart"}
              size={16}
              color={isFavorited ? "#F97316" : "#FFFFFF"}
            />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.info}>
        <Text style={styles.price} numberOfLines={1}>
          {currency}
          {price.toLocaleString(undefined, {
            minimumFractionDigits: price % 1 ? 2 : 0,
            maximumFractionDigits: 2,
          })}
        </Text>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
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
    marginBottom: 6,
    backgroundColor: "#FFFFFF",
  },
  pressed: { opacity: 0.92 },
  // Compact image so a full 2×2 product grid fits above the bottom nav on 720×1280.
  imageContainer: {
    width: "100%",
    height: Math.round(CARD_WIDTH * 0.48),
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
  info: { paddingHorizontal: 8, paddingVertical: 4, gap: 1 },
  price: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  title: { fontSize: 11, color: "#334155", lineHeight: 14 },
  location: { fontSize: 10, color: "#94A3B8", marginTop: 0 },
});
