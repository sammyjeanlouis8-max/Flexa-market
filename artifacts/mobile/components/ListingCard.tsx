import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Listing } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { hideListing, hideSellerListings } from "@/lib/safetyApi";

const CARD_WIDTH = (Dimensions.get("window").width - 12 * 3) / 2;

interface ListingCardProps {
  item: Listing;
  onFavoriteToggle?: (id: number, isFav: boolean) => void;
  isFavorited?: boolean;
  onHidden?: (payload: { listingId?: number; sellerId?: number }) => void;
}

export function ListingCard({
  item,
  onFavoriteToggle,
  isFavorited = false,
  onHidden,
}: ListingCardProps) {
  const { token, user } = useAuth();
  const imageUri = item.images?.[0];
  const price = Number(item.price || 0);
  const currency = item.currency === "HTG" ? "G" : "$";
  const isOwner = !!(user?.id && item.sellerId && user.id === item.sellerId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const requireLogin = () => {
    Alert.alert("Sign in required", "Sign in to hide products across your devices.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign in", onPress: () => router.push("/auth/login") },
    ]);
  };

  const doHideListing = async () => {
    if (!token) { requireLogin(); return; }
    setBusy(true);
    try {
      await hideListing(item.id, { token });
      onHidden?.({ listingId: item.id });
      Alert.alert("Hidden", "This product is hidden from your catalog.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not hide product");
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  const doHideSeller = async () => {
    if (!item.sellerId) return;
    if (!token) { requireLogin(); return; }
    setBusy(true);
    try {
      await hideSellerListings(item.sellerId, { token });
      onHidden?.({ sellerId: item.sellerId });
      Alert.alert("Hidden", "All products from this seller are hidden.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not hide seller");
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  const openMenu = () => {
    if (isOwner) return;
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Hide this product", "Hide all products from this seller"],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 1,
        },
        (index) => {
          if (index === 1) void doHideListing();
          if (index === 2) void doHideSeller();
        },
      );
      return;
    }
    setMenuOpen(true);
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => router.push(`/listing/${item.id}`)}
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
        {!isOwner ? (
          <Pressable
            style={styles.menuBtn}
            hitSlop={8}
            disabled={busy}
            onPress={(e) => {
              e.stopPropagation?.();
              openMenu();
            }}
            accessibilityLabel="Listing options"
          >
            <Feather name="more-vertical" size={16} color="#FFFFFF" />
          </Pressable>
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

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuSheet}>
            <Pressable style={styles.menuItem} disabled={busy} onPress={() => void doHideListing()}>
              <Feather name="eye-off" size={16} color="#0F172A" />
              <Text style={styles.menuText}>Hide this product</Text>
            </Pressable>
            {item.sellerId ? (
              <Pressable style={styles.menuItem} disabled={busy} onPress={() => void doHideSeller()}>
                <Feather name="slash" size={16} color="#0F172A" />
                <Text style={styles.menuText}>Hide all products from this seller</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.menuItem} onPress={() => setMenuOpen(false)}>
              <Text style={[styles.menuText, { color: "#64748B" }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
  imageContainer: { width: "100%", height: CARD_WIDTH, backgroundColor: "#F1F5F9" },
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
  boostText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  favBtn: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  info: { padding: 10, gap: 2 },
  price: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  title: { fontSize: 12, fontWeight: "600", color: "#1E293B", lineHeight: 16 },
  location: { fontSize: 11, color: "#64748B", marginTop: 2 },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.35)",
    justifyContent: "flex-end",
  },
  menuSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 12,
    gap: 4,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  menuText: { fontSize: 15, fontWeight: "600", color: "#0F172A", flex: 1 },
});
