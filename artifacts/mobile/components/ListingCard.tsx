import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const CARD_WIDTH = (Dimensions.get("window").width - 12 * 3) / 2;

interface ListingCardProps {
  item: any;
  onFavoriteToggle?: (id: number, isFav: boolean) => void;
  isFavorited?: boolean;
}

export function ListingCard({ item, onFavoriteToggle, isFavorited = false }: ListingCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/listing/${item.id}`)}
      activeOpacity={0.85}
    >
      <View style={styles.imageContainer}>
        <View style={styles.imagePlaceholder}>
          <Feather name="image" size={28} color="#94a3b8" />
        </View>
      </View>
      <View style={styles.info}>
        <Text style={styles.price} numberOfLines={1}>
          ${parseFloat(item.price || "0").toLocaleString()}
        </Text>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.location} numberOfLines={1}>
          {item.city ?? item.location ?? item.country ?? ""}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { width: CARD_WIDTH, borderRadius: 14, borderWidth: 1, borderColor: "#1e293b", overflow: "hidden", marginBottom: 12, backgroundColor: "#0F172A" },
  imageContainer: { width: "100%", height: CARD_WIDTH },
  imagePlaceholder: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", backgroundColor: "#1e293b" },
  info: { padding: 10, gap: 3 },
  price: { fontSize: 15, fontWeight: "700", color: "#F8FAFC" },
  title: { fontSize: 13, color: "#F8FAFC", lineHeight: 18 },
  location: { fontSize: 11, color: "#94a3b8", marginTop: 1 },
});
