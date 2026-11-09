import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { fetchListing, type Listing } from "@/lib/api";
import { isDominicanListingCountry } from "@/lib/checkoutApi";
import {
  addFavorite,
  isFavorite,
  removeFavorite,
} from "@/lib/favoritesApi";

const WIDTH = Dimensions.get("window").width;

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { addItem, isInCart } = useCart();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageIndex, setImageIndex] = useState(0);
  const [addedFlash, setAddedFlash] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchListing(id, { token });
        if (!cancelled) setListing(data);
        if (!cancelled && token) {
          const liked = await isFavorite(Number(id), { token });
          if (!cancelled) setFavorited(liked);
        } else if (!cancelled) {
          setFavorited(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load listing");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  const images = listing?.images?.length ? listing.images : [];
  const price = Number(listing?.price || 0);
  const currency =
    listing?.currency === "HTG"
      ? "G"
      : listing?.currency === "DOP"
        ? "RD$"
        : "$";
  const listingId = Number(listing?.id || id);
  const inCart = listingId ? isInCart(listingId) : false;
  const isOwnListing =
    !!user?.id && !!listing?.sellerId && user.id === listing.sellerId;
  const dominican = isDominicanListingCountry(listing?.country);

  const onToggleFavorite = async () => {
    if (!listingId) return;
    if (!token) {
      router.push("/auth/login");
      return;
    }
    if (favBusy) return;
    setFavBusy(true);
    try {
      if (favorited) {
        await removeFavorite(listingId, { token });
        setFavorited(false);
      } else {
        await addFavorite(listingId, { token });
        setFavorited(true);
      }
    } catch (e) {
      Alert.alert(
        "Favorites",
        e instanceof Error ? e.message : "Could not update favorites",
      );
    } finally {
      setFavBusy(false);
    }
  };

  const onAddToCart = () => {
    if (!listing || !listingId) return;
    if (!listing.sellerId) {
      Alert.alert("Unavailable", "This listing cannot be added to cart yet.");
      return;
    }
    if (isOwnListing) {
      Alert.alert("Your listing", "You cannot buy your own product.");
      return;
    }
    if (inCart) {
      router.push("/cart");
      return;
    }
    addItem({
      listingId,
      title: listing.title,
      price,
      currency: listing.currency ?? "USD",
      image: listing.images?.[0] ?? null,
      country: listing.country ?? null,
      city: listing.city ?? listing.location ?? null,
      sellerId: listing.sellerId,
      quantity: 1,
    });
    setAddedFlash(true);
    setTimeout(() => setAddedFlash(false), 1600);
    if (dominican) {
      Alert.alert(
        "Added to cart",
        "Dominican Republic items must be checked out from the product page (seller shipping). Cart wallet checkout is not available for these listings.",
      );
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          Listing
        </Text>
        <Pressable
          style={styles.iconBtn}
          onPress={onToggleFavorite}
          accessibilityLabel={favorited ? "Remove favorite" : "Add favorite"}
        >
          <Feather
            name="heart"
            size={20}
            color={favorited ? "#EF4444" : "#0F172A"}
          />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 48 }} />
      ) : error || !listing ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error ?? "Listing not found"}</Text>
          <Pressable style={styles.retry} onPress={() => router.replace("/")}>
            <Text style={styles.retryText}>Back to home</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / WIDTH);
                setImageIndex(idx);
              }}
            >
              {(images.length ? images : [null]).map((uri, i) => (
                <View key={i} style={styles.hero}>
                  {uri ? (
                    <Image
                      source={{ uri }}
                      style={styles.heroImage}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View style={[styles.heroImage, styles.heroPlaceholder]}>
                      <Feather name="image" size={40} color="#94A3B8" />
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
            {images.length > 1 ? (
              <Text style={styles.dots}>
                {imageIndex + 1} / {images.length}
              </Text>
            ) : null}

            <View style={styles.body}>
              <Text style={styles.price}>
                {currency}
                {price.toLocaleString(undefined, {
                  minimumFractionDigits: price % 1 ? 2 : 0,
                  maximumFractionDigits: 2,
                })}
              </Text>
              <Text style={styles.title}>{listing.title}</Text>
              <Text style={styles.meta}>
                {[listing.city, listing.country, listing.condition]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {listing.isBoosted ? (
                <View style={styles.boost}>
                  <Text style={styles.boostText}>Boosted listing</Text>
                </View>
              ) : null}
              {listing.sellerName ? (
                <View style={styles.seller}>
                  <Feather name="user" size={16} color="#475569" />
                  <Text style={styles.sellerText}>
                    {listing.sellerName}
                    {listing.sellerIsVerified ? " · Verified" : ""}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.section}>Description</Text>
              <Text style={styles.description}>
                {listing.description?.trim() || "No description provided."}
              </Text>
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              style={styles.secondaryCta}
              onPress={() =>
                token ? router.push("/(tabs)/inbox") : router.push("/auth/login")
              }
            >
              <Text style={styles.secondaryCtaText}>Message</Text>
            </Pressable>
            <Pressable
              style={[
                styles.primaryCta,
                (inCart || addedFlash) && styles.primaryCtaInCart,
                isOwnListing && styles.primaryCtaDisabled,
              ]}
              onPress={onAddToCart}
              disabled={isOwnListing}
            >
              <Text style={styles.primaryCtaText}>
                {isOwnListing
                  ? "Your listing"
                  : addedFlash
                    ? "Added!"
                    : inCart
                      ? "In cart · View"
                      : "Add to Cart"}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  topTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  hero: { width: WIDTH, height: WIDTH * 0.92, backgroundColor: "#E2E8F0" },
  heroImage: { width: "100%", height: "100%" },
  heroPlaceholder: { alignItems: "center", justifyContent: "center" },
  dots: {
    textAlign: "center",
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
  },
  body: { paddingHorizontal: 16, paddingTop: 14, gap: 8 },
  price: { fontSize: 26, fontWeight: "800", color: "#0F172A" },
  title: { fontSize: 20, fontWeight: "700", color: "#0F172A", lineHeight: 26 },
  meta: { fontSize: 13, color: "#64748B" },
  boost: {
    alignSelf: "flex-start",
    backgroundColor: "#FFF7ED",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  boostText: { color: "#C2410C", fontSize: 12, fontWeight: "700" },
  seller: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  sellerText: { color: "#475569", fontSize: 14, fontWeight: "600" },
  section: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  description: { fontSize: 15, lineHeight: 22, color: "#334155" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  secondaryCta: {
    flex: 1,
    height: 50,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryCtaText: { fontWeight: "800", color: "#0F172A" },
  primaryCta: {
    flex: 1.2,
    height: 50,
    borderRadius: 999,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryCtaInCart: { backgroundColor: "#EA580C" },
  primaryCtaDisabled: { backgroundColor: "#CBD5E1" },
  primaryCtaText: { fontWeight: "800", color: "#FFFFFF" },
  centered: { alignItems: "center", padding: 32, gap: 12 },
  error: { color: "#64748B", textAlign: "center" },
  retry: {
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontWeight: "800" },
});
