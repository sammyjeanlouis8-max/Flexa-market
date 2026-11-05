import { Feather } from "@expo/vector-icons";
import type { Listing } from "@workspace/api-client-react";
import { Image } from "expo-image";
import { router } from "expo-router";
import React from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { formatListingPrice, listingLocation } from "@/lib/format";

const CARD_WIDTH = (Dimensions.get("window").width - 12 * 3) / 2;

interface ListingCardProps {
  item: Listing;
  onFavoriteToggle?: (id: number, isFav: boolean) => void;
  isFavorited?: boolean;
}

export function ListingCard({ item }: ListingCardProps) {
  const imageUri = item.images?.[0];

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/listing/${item.id}`)}
      activeOpacity={0.85}
    >
      <View style={styles.imageContainer}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            contentFit="cover"
            transition={200}
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
      </View>
      <View style={styles.info}>
        <Text style={styles.price} numberOfLines={1}>
          {formatListingPrice(item.price, item.currency)}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.location} numberOfLines={1}>
          {listingLocation(item)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1e293b",
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#0F172A",
  },
  imageContainer: { width: "100%", height: CARD_WIDTH },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1e293b",
  },
  boostBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#F97316",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  boostText: { color: "#0F172A", fontSize: 10, fontWeight: "700" },
  info: { padding: 10, gap: 3 },
  price: { fontSize: 15, fontWeight: "700", color: "#F8FAFC" },
  title: { fontSize: 13, color: "#F8FAFC", lineHeight: 18 },
  location: { fontSize: 11, color: "#94a3b8", marginTop: 1 },
});
