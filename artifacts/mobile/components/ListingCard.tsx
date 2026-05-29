import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { Listing } from "@/hooks/useApi";

const CARD_WIDTH = (Dimensions.get("window").width - 12 * 3) / 2;

const CONDITION_COLORS: Record<string, string> = {
  new: "#22C55E",
  "like new": "#16A34A",
  good: "#3B82F6",
  fair: "#F59E0B",
  poor: "#EF4444",
};

interface ListingCardProps {
  item: Listing;
  onFavoriteToggle?: (id: number, isFav: boolean) => void;
  isFavorited?: boolean;
}

export function ListingCard({ item, onFavoriteToggle, isFavorited = false }: ListingCardProps) {
  const colors = useColors();
  const [fav, setFav] = useState(isFavorited);

  const conditionColor = CONDITION_COLORS[item.condition?.toLowerCase()] ?? colors.mutedForeground;
  const imageUrl = item.images?.[0];
  const timeAgo = item.createdAt ? formatTimeAgo(item.createdAt) : "";

  function handleFav() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFav((prev) => !prev);
    onFavoriteToggle?.(item.id, !fav);
  }

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push(`/listing/${item.id}`)}
      activeOpacity={0.85}
      testID={`listing-card-${item.id}`}
    >
      <View style={styles.imageContainer}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.muted }]}>
            <Feather name="image" size={28} color={colors.mutedForeground} />
          </View>
        )}
        {item.isBoosted && (
          <View style={[styles.boostedBadge, { backgroundColor: colors.accent }]}>
            <Text style={styles.boostedText}>Sponsorisé</Text>
          </View>
        )}
        <TouchableOpacity style={styles.heartBtn} onPress={handleFav} testID={`fav-btn-${item.id}`}>
          <Feather name="heart" size={18} color={fav ? "#EF4444" : "#FFFFFF"} fill={fav ? "#EF4444" : "none"} />
        </TouchableOpacity>
      </View>

      <View style={styles.info}>
        <Text style={[styles.price, { color: colors.foreground }]} numberOfLines={1}>
          ${parseFloat(item.price || "0").toLocaleString()}
        </Text>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.meta}>
          <View style={[styles.conditionDot, { backgroundColor: conditionColor }]} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item.condition ?? "—"}
          </Text>
        </View>
        <Text style={[styles.location, { color: colors.mutedForeground }]} numberOfLines={1}>
          {item.city ?? item.location ?? item.country ?? ""}
          {timeAgo ? ` · ${timeAgo}` : ""}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}j`;
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12,
  },
  imageContainer: {
    width: "100%",
    height: CARD_WIDTH,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  boostedBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  boostedText: {
    color: "#FFF",
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
  },
  heartBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 20,
    padding: 6,
  },
  info: {
    padding: 10,
    gap: 3,
  },
  price: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  conditionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  metaText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textTransform: "capitalize",
  },
  location: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
});
