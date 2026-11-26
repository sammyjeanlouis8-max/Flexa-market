import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { restaurantTheme as T } from "@/lib/restaurantTheme";
import type { Restaurant } from "@/lib/restaurantTypes";

export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const router = useRouter();
  const open = restaurant.isOpenNow;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
      onPress={() => router.push(`/restaurant/${restaurant.id}` as never)}
      testID={`restaurant-card-${restaurant.id}`}
    >
      <View style={styles.coverWrap}>
        {restaurant.coverPhotoUrl || restaurant.logoUrl ? (
          <Image
            source={{ uri: restaurant.coverPhotoUrl || restaurant.logoUrl || undefined }}
            style={styles.cover}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Feather name="coffee" size={28} color={T.accentSoft} />
          </View>
        )}
        <View style={[styles.badge, open ? styles.badgeOpen : styles.badgeClosed]}>
          <Text style={styles.badgeText}>{open ? "Open" : "Closed"}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {restaurant.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[restaurant.city, restaurant.cuisineTags.slice(0, 2).join(" · ")].filter(Boolean).join(" · ")}
        </Text>
        <View style={styles.row}>
          {restaurant.offersDelivery ? (
            <View style={styles.chip}>
              <Feather name="truck" size={12} color={T.accent} />
              <Text style={styles.chipText}>Delivery</Text>
            </View>
          ) : null}
          <Feather name="chevron-right" size={16} color="#94A3B8" style={{ marginLeft: "auto" }} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginBottom: 12,
  },
  coverWrap: { height: 120, position: "relative" },
  cover: { width: "100%", height: "100%" },
  coverPlaceholder: {
    backgroundColor: T.forestDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeOpen: { backgroundColor: T.open },
  badgeClosed: { backgroundColor: "rgba(15,23,42,0.65)" },
  badgeText: { color: T.white, fontSize: 11, fontWeight: "800" },
  body: { padding: 12, gap: 4 },
  name: { fontSize: 16, fontWeight: "800", color: T.ink },
  meta: { fontSize: 12, color: T.muted, fontWeight: "500" },
  row: { flexDirection: "row", alignItems: "center", marginTop: 6, gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: T.mint,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  chipText: { fontSize: 11, fontWeight: "700", color: T.accent },
});
