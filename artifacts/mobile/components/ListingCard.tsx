import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { Listing } from "@/lib/api";
import {
  hasUsableListingImage,
  pickCoverImage,
} from "@/lib/listingImages";

const CARD_WIDTH = (Dimensions.get("window").width - 12 * 3) / 2;

interface ListingCardProps {
  item: Listing;
  onFavoriteToggle?: (id: number, isFav: boolean) => void;
  isFavorited?: boolean;
  /** Override default fixed width (e.g. 48% inside padded Today's Picks). */
  style?: StyleProp<ViewStyle>;
  /** Open Product Details in website WebView (default) or native PDP. */
  openInWebView?: boolean;
}

export function ListingCard({
  item,
  onFavoriteToggle,
  isFavorited = false,
  style,
  openInWebView = true,
}: ListingCardProps) {
  const usable = hasUsableListingImage(item.images);
  const candidates = (item.images || []).filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0,
  );
  const [coverIndex, setCoverIndex] = useState(0);
  const [allImagesFailed, setAllImagesFailed] = useState(false);
  const imageUri =
    pickCoverImage(item.images) ||
    candidates[coverIndex] ||
    null;
  const price = Number(item.price || 0);
  const currency = item.currency === "HTG" ? "G" : "$";

  // Hide from public discovery grids when no usable image (placeholders don't count)
  // or every candidate failed to load — keeps 2-col grids without empty gaps.
  if (!usable || allImagesFailed) return null;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}
      onPress={() =>
        router.push(
          openInWebView
            ? `/webview-listing/${item.id}`
            : `/listing/${item.id}`,
        )
      }
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={styles.imageContainer}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            contentFit="cover"
            transition={200}
            recyclingKey={`listing-${item.id}-${coverIndex}`}
            onError={() => {
              if (coverIndex + 1 < candidates.length) {
                setCoverIndex((i) => i + 1);
              } else {
                setAllImagesFailed(true);
              }
            }}
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
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.location} numberOfLines={1}>
          {item.city ?? item.location ?? item.country ?? ""}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  pressed: { opacity: 0.92 },
  imageContainer: { width: "100%", aspectRatio: 1, backgroundColor: "#F1F5F9" },
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
  info: { padding: 10, gap: 3 },
  price: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  title: { fontSize: 13, color: "#334155", lineHeight: 18 },
  location: { fontSize: 11, color: "#94A3B8", marginTop: 1 },
});
