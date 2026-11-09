import { StateView } from "@/components/StateView";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ListingDetail = {
  id: number;
  title?: string;
  description?: string;
  price?: string | number;
  currency?: string;
  city?: string | null;
  location?: string | null;
  country?: string | null;
  condition?: string | null;
  category?: string | null;
  subcategory?: string | null;
  images?: string[] | null;
  sellerId?: number;
  sellerName?: string | null;
  sellerRating?: number | null;
  sellerIsVerified?: boolean;
  favoriteCount?: number;
  viewCount?: number;
  isFavorited?: boolean;
  isOwner?: boolean;
  isBoosted?: boolean;
  stockQuantity?: number | null;
  status?: string;
};

function formatPrice(price: string | number | undefined, currency?: string): string {
  const value = typeof price === "number" ? price : parseFloat(String(price ?? "0"));
  const amount = Number.isFinite(value) ? value.toLocaleString() : "0";
  const code = (currency || "USD").toUpperCase();
  if (code === "HTG") return `G ${amount}`;
  if (code === "DOP") return `RD$ ${amount}`;
  return `$ ${amount}`;
}

const WIDTH = Dimensions.get("window").width;

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, user } = useAuth();
  const { t } = useLanguage();
  const { addItem, isInCart } = useCart();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  useAndroidBack();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOffline(false);
    try {
      const res = await apiFetch(`/listings/${id}`, {
        token,
        auth: Boolean(token),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || t("listingNotFound"));
      }
      const data = await res.json();
      setListing(data);
      // Fire-and-forget view counter — preserves existing business analytics.
      void apiFetch(`/listings/${id}/view`, { method: "POST", token, auth: Boolean(token) }).catch(
        () => {},
      );
    } catch (e: any) {
      setError(e?.message || t("listingLoadErr"));
      setOffline(true);
      setListing(null);
    } finally {
      setLoading(false);
    }
  }, [id, token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFavorite() {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    if (!listing || favBusy) return;
    setFavBusy(true);
    try {
      const method = listing.isFavorited ? "DELETE" : "POST";
      const res = await apiFetch(`/favorites/${listing.id}`, { method, token });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not update favorite.");
      }
      setListing((prev) =>
        prev
          ? {
              ...prev,
              isFavorited: !prev.isFavorited,
              favoriteCount: Math.max(
                0,
                (prev.favoriteCount || 0) + (prev.isFavorited ? -1 : 1),
              ),
            }
          : prev,
      );
    } catch (e: any) {
      setError(e?.message || "Favorite update failed.");
    } finally {
      setFavBusy(false);
    }
  }

  const images = (listing?.images || [])
    .map((u) => resolveMediaUrl(u))
    .filter((u): u is string => Boolean(u));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={20} color="#F8FAFC" />
        </Pressable>
        <Text style={styles.brand}>Flexa Market</Text>
        <Pressable style={styles.iconBtn} onPress={() => void toggleFavorite()} disabled={favBusy}>
          <Feather
            name={listing?.isFavorited ? "heart" : "heart"}
            size={20}
            color={listing?.isFavorited ? "#F97316" : "#F8FAFC"}
          />
        </Pressable>
      </View>

      <StateView loading={loading} error={!listing ? error : null} offline={!listing && offline} onRetry={load}>
        {listing ? (
          <ScrollView contentContainerStyle={styles.content}>
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {images.length > 0 ? (
                images.map((uri) => (
                  <Image key={uri} source={{ uri }} style={styles.hero} contentFit="cover" />
                ))
              ) : (
                <View style={[styles.hero, styles.heroFallback]}>
                  <Feather name="image" size={40} color="#64748B" />
                </View>
              )}
            </ScrollView>

            <View style={styles.pad}>
              <View style={styles.priceRow}>
                <Text style={styles.price}>{formatPrice(listing.price, listing.currency)}</Text>
                {listing.isBoosted ? (
                  <View style={styles.boost}>
                    <Text style={styles.boostText}>Boost</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.title}>{listing.title}</Text>
              <Text style={styles.meta}>
                {[listing.condition, listing.category, listing.subcategory, listing.city || listing.location, listing.country]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Text style={styles.stats}>
                {(listing.viewCount ?? 0).toLocaleString()} views ·{" "}
                {(listing.favoriteCount ?? 0).toLocaleString()} favorites
              </Text>

              {listing.sellerName ? (
                <View style={styles.sellerCard}>
                  <Feather name="user" size={18} color="#F8FAFC" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sellerName}>
                      {t("seller")}: {listing.sellerName}
                      {listing.sellerIsVerified ? " ✓" : ""}
                    </Text>
                    {typeof listing.sellerRating === "number" ? (
                      <Text style={styles.sellerMeta}>
                        {t("rating")}: {listing.sellerRating.toFixed(1)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}

              <Text style={styles.section}>{t("description")}</Text>
              <Text style={styles.body}>{listing.description || "No description provided."}</Text>

              {error ? <Text style={styles.inlineError}>{error}</Text> : null}

              {!listing.isOwner ? (
                <View style={styles.actionsCol}>
                  <View style={styles.actions}>
                    <Pressable
                      style={styles.secondaryBtn}
                      onPress={() => {
                        const price = typeof listing.price === "number"
                          ? listing.price
                          : parseFloat(String(listing.price ?? "0"));
                        const result = addItem({
                          listingId: listing.id,
                          title: listing.title || "Listing",
                          price: Number.isFinite(price) ? price : 0,
                          currency: listing.currency || "USD",
                          image: listing.images?.[0] || null,
                          country: listing.country || null,
                          sellerId: listing.sellerId || 0,
                          stockQuantity: listing.stockQuantity,
                        });
                        if (!result.ok) {
                          Alert.alert("Cart", result.error || "Could not add item.");
                          return;
                        }
                        Alert.alert(
                          "Cart",
                          result.alreadyInCart ? "Already in cart." : "Added to cart.",
                          [
                            { text: "Keep browsing", style: "cancel" },
                            { text: "View cart", onPress: () => router.push("/cart") },
                          ],
                        );
                      }}
                    >
                      <Text style={styles.secondaryBtnText}>
                        {isInCart(listing.id) ? "In cart" : "Add to cart"}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.primaryBtn}
                      onPress={() => {
                        if (!token) {
                          router.push("/auth/login");
                          return;
                        }
                        if (user?.id && listing.sellerId === user.id) {
                          Alert.alert("Purchase", "You cannot buy your own listing.");
                          return;
                        }
                        const price = typeof listing.price === "number"
                          ? listing.price
                          : parseFloat(String(listing.price ?? "0"));
                        addItem({
                          listingId: listing.id,
                          title: listing.title || "Listing",
                          price: Number.isFinite(price) ? price : 0,
                          currency: listing.currency || "USD",
                          image: listing.images?.[0] || null,
                          country: listing.country || null,
                          sellerId: listing.sellerId || 0,
                          stockQuantity: listing.stockQuantity,
                        });
                        router.push({
                          pathname: "/checkout",
                          params: { mode: "single", listingId: String(listing.id) },
                        });
                      }}
                    >
                      <Text style={styles.primaryBtnText}>Buy now</Text>
                    </Pressable>
                  </View>
                  <Pressable
                    style={styles.messageBtn}
                    onPress={async () => {
                      if (!token) {
                        router.push("/auth/login");
                        return;
                      }
                      if (!listing.sellerId) {
                        Alert.alert("Chat", "Seller unavailable.");
                        return;
                      }
                      if (user?.id && listing.sellerId === user.id) {
                        Alert.alert("Chat", "You cannot message yourself.");
                        return;
                      }
                      try {
                        const res = await apiFetch("/conversations", {
                          method: "POST",
                          token,
                          body: JSON.stringify({
                            listingId: listing.id,
                            sellerId: listing.sellerId,
                          }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          Alert.alert("Chat", data.error || `Could not start chat (${res.status})`);
                          return;
                        }
                        if (data.id) router.push(`/chat/${data.id}`);
                      } catch {
                        Alert.alert("Chat", "Could not start conversation.");
                      }
                    }}
                  >
                    <Text style={styles.messageBtnText}>Message seller</Text>
                  </Pressable>
                </View>
              ) : null}

              <Text style={styles.note}>
                Physical checkout uses Stripe or Flexa Wallet via existing APIs. Digital goods remain
                blocked on Android until Play Billing compliance is verified.
              </Text>
            </View>
          </ScrollView>
        ) : null}
      </StateView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 16, fontWeight: "800", color: "#F8FAFC" },
  content: { paddingBottom: 40 },
  hero: { width: WIDTH, height: 300, backgroundColor: "#1E293B" },
  heroFallback: { alignItems: "center", justifyContent: "center" },
  pad: { paddingHorizontal: 16, paddingTop: 16, gap: 6 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  price: { fontSize: 24, fontWeight: "800", color: "#F97316" },
  boost: {
    backgroundColor: "#F97316",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  boostText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "700", color: "#F8FAFC", marginTop: 4 },
  meta: { color: "#94A3B8", fontSize: 13 },
  stats: { color: "#64748B", fontSize: 12, marginTop: 2 },
  sellerCard: {
    marginTop: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    padding: 12,
  },
  sellerName: { color: "#F8FAFC", fontWeight: "700" },
  sellerMeta: { color: "#94A3B8", fontSize: 12, marginTop: 2 },
  section: { marginTop: 18, fontSize: 15, fontWeight: "700", color: "#F8FAFC" },
  body: { color: "#CBD5E1", fontSize: 14, lineHeight: 22 },
  inlineError: { color: "#FCA5A5", marginTop: 10 },
  actionsCol: { marginTop: 16, gap: 10 },
  actions: { flexDirection: "row", gap: 10 },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#F97316",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#F8FAFC", fontWeight: "600" },
  messageBtn: {
    borderWidth: 1,
    borderColor: "#F97316",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  messageBtnText: { color: "#F97316", fontWeight: "700" },
  note: { marginTop: 24, color: "#64748B", fontSize: 12, lineHeight: 18 },
});
