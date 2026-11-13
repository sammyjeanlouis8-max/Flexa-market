/**
 * Native product details — matches flexamarket.com mobile PDP (Glister layout):
 * left thumbnails, main image + counter, share/favorite, search-similar,
 * title/seller/rating/price/delivery/stock, pinned qty + Add to Cart + Buy Now.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { PDP_METRICS, pdpMainSize } from "@/constants/layoutMetrics";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { fetchListing, type Listing } from "@/lib/api";
import { isDominicanListingCountry } from "@/lib/checkoutApi";
import { createConversation } from "@/lib/chatApi";
import {
  addFavorite,
  isFavorite,
  removeFavorite,
} from "@/lib/favoritesApi";
import { resolveMediaUrl } from "@/lib/mediaUrl";

const THUMB = PDP_METRICS.thumbSize;

type GalleryItem =
  | { type: "image"; uri: string }
  | { type: "video"; uri: string; poster?: string };

function formatMoney(price: number, currency?: string | null) {
  const symbol =
    currency === "HTG" ? "G " : currency === "DOP" ? "RD$" : "$";
  const formatted = price.toLocaleString(undefined, {
    minimumFractionDigits: price % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

function conditionLabel(raw?: string | null) {
  if (!raw) return null;
  const s = raw.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ListingDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const { token, user } = useAuth();
  const { addItem, isInCart } = useCart();

  /** Web: aspect-square main, max-h min(52vh, 380); thumb rail 44 + gaps. */
  const mainSize = pdpMainSize(winW, winH);
  const galleryH = mainSize;

  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageIndex, setImageIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [addedFlash, setAddedFlash] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [msgBusy, setMsgBusy] = useState(false);
  const [purchaseBarH, setPurchaseBarH] = useState(
    PDP_METRICS.purchaseBarApprox + Math.max(insets.bottom, 8),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) {
        setError("Missing listing id");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setImageIndex(0);
      setQty(1);
      try {
        const data = await fetchListing(id, { token });
        if (!cancelled) {
          setListing(data);
          setImageIndex(0);
        }
        if (!cancelled && token) {
          const liked = await isFavorite(Number(id), { token });
          if (!cancelled) setFavorited(liked);
        } else if (!cancelled) {
          setFavorited(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load listing");
          setListing(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  const media = useMemo((): GalleryItem[] => {
    if (!listing) return [];
    const items: GalleryItem[] = [];
    const poster = resolveMediaUrl(listing.images?.[0]);
    const promo = resolveMediaUrl(listing.boostVideoUrl || listing.listingVideoUrl);
    if (promo) items.push({ type: "video", uri: promo, poster });
    for (const u of listing.images || []) {
      const uri = resolveMediaUrl(u);
      if (uri) items.push({ type: "image", uri });
    }
    return items;
  }, [listing]);
  const images = useMemo(
    () => media.filter((m) => m.type === "image").map((m) => m.uri),
    [media],
  );
  const current = media[imageIndex] ?? null;

  const price = Number(listing?.price || 0);
  const listingId = Number(listing?.id || id);
  const inCart = listingId ? isInCart(listingId) : false;
  const isOwnListing =
    !!user?.id && !!listing?.sellerId && user.id === listing.sellerId;
  const dominican = isDominicanListingCountry(listing?.country);
  const stock =
    listing?.stockQuantity == null ? null : Number(listing.stockQuantity);
  const maxQty = Math.max(1, Math.min(30, stock != null && stock > 0 ? stock : 30));
  const soldOut =
    listing?.status === "sold" || (stock != null && stock <= 0);
  const rating = Number(listing?.sellerRating ?? 0);
  const money = formatMoney(price, listing?.currency);
  const moneyLine =
    qty > 1 ? `${formatMoney(price * qty, listing?.currency)}` : money;

  useEffect(() => {
    setQty((q) => Math.min(Math.max(1, q), maxQty));
  }, [maxQty]);

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

  const onShare = async () => {
    if (!listing) return;
    const url = `https://flexamarket.com/listing/${listingId}`;
    try {
      await Share.share({
        message: `${listing.title} — ${money}\n${url}`,
        url,
        title: listing.title,
      });
    } catch {
      /* user dismissed */
    }
  };

  const onSearchSimilar = () => {
    const slug = listing?.categorySlug;
    if (slug) {
      router.push({ pathname: "/(tabs)/search", params: { category: slug } } as any);
      return;
    }
    router.push({
      pathname: "/(tabs)/search",
      params: { q: listing?.category || listing?.title || "" },
    } as any);
  };

  const onMessageSeller = async () => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    if (!listing?.sellerId || !listingId) {
      Alert.alert("Unavailable", "This listing cannot be messaged yet.");
      return;
    }
    if (isOwnListing) {
      Alert.alert("Your listing", "You cannot message yourself.");
      return;
    }
    if (msgBusy) return;
    setMsgBusy(true);
    try {
      const conv = await createConversation(
        { listingId, sellerId: listing.sellerId },
        { token },
      );
      router.push(`/chat/${conv.id}`);
    } catch (e) {
      Alert.alert(
        "Chat",
        e instanceof Error ? e.message : "Could not start conversation",
      );
    } finally {
      setMsgBusy(false);
    }
  };

  const ensureCanBuy = () => {
    if (!listing || !listingId) return false;
    if (!listing.sellerId) {
      Alert.alert("Unavailable", "This listing cannot be purchased yet.");
      return false;
    }
    if (isOwnListing) {
      Alert.alert("Your listing", "You cannot buy your own product.");
      return false;
    }
    if (soldOut) {
      Alert.alert("Sold out", "This item is no longer available.");
      return false;
    }
    return true;
  };

  const onAddToCart = () => {
    if (!ensureCanBuy() || !listing) return;
    if (inCart) {
      router.push("/cart");
      return;
    }
    addItem({
      listingId,
      title: listing.title,
      price,
      currency: listing.currency ?? "USD",
      image: images[0] ?? null,
      country: listing.country ?? null,
      city: listing.city ?? listing.location ?? null,
      sellerId: listing.sellerId!,
      quantity: qty,
    });
    setAddedFlash(true);
    setTimeout(() => setAddedFlash(false), 1600);
    if (dominican) {
      Alert.alert(
        "Added to cart",
        "Dominican Republic items must be checked out from Buy Now (seller shipping).",
      );
    }
  };

  const onBuyNow = () => {
    if (!ensureCanBuy() || !listing) return;
    if (!token) {
      router.push("/auth/login");
      return;
    }
    if (!inCart) {
      addItem({
        listingId,
        title: listing.title,
        price,
        currency: listing.currency ?? "USD",
        image: images[0] ?? null,
        country: listing.country ?? null,
        city: listing.city ?? listing.location ?? null,
        sellerId: listing.sellerId!,
        quantity: qty,
      });
    }
    if (dominican) {
      router.push({
        pathname: "/stripe-checkout",
        params: { listingId: String(listingId) },
      });
      return;
    }
    router.push({
      pathname: "/checkout",
      params: { ids: String(listingId) },
    });
  };

  const goHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <View style={styles.root} testID="listing-detail">
      <AppHeader showBack showMenu={false} title="Flexa Market" />

      {loading ? (
        <ActivityIndicator color={colors.flexaOrange} style={{ marginTop: 48 }} />
      ) : error || !listing ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error ?? "Listing not found"}</Text>
          <Pressable
            style={styles.retry}
            onPress={goHome}
            testID="listing-back-home"
          >
            <Text style={styles.retryText}>Back to home</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{
              // Measured web bar is 61px; use onLayout height so delivery/stock
              // clear the sticky purchase bar instead of sitting under it.
              paddingBottom: purchaseBarH + 48,
            }}
            testID="listing-scroll"
          >
            {/* Gallery: narrow thumb rail + large square main (web metrics) */}
            <View style={[styles.galleryRow, { minHeight: galleryH }]}>
              {media.length > 1 ? (
                <ScrollView
                  style={[styles.thumbs, { maxHeight: galleryH }]}
                  contentContainerStyle={styles.thumbsInner}
                  showsVerticalScrollIndicator={false}
                >
                  {media.map((item, i) => (
                    <Pressable
                      key={`${item.type}-${i}`}
                      onPress={() => setImageIndex(i)}
                      style={[
                        styles.thumb,
                        i === imageIndex && styles.thumbActive,
                      ]}
                      accessibilityLabel={
                        item.type === "video" ? "Promo video" : `Photo ${i + 1}`
                      }
                      testID={`listing-thumb-${i}`}
                    >
                      <Image
                        source={{
                          uri:
                            item.type === "video"
                              ? item.poster || images[0] || ""
                              : item.uri,
                        }}
                        style={styles.thumbImg}
                        contentFit="cover"
                      />
                      {item.type === "video" ? (
                        <View style={styles.thumbPromo}>
                          <Feather name="play" size={10} color="#FFFFFF" />
                          <Text style={styles.thumbPromoText}>PROMO</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  ))}
                </ScrollView>
              ) : (
                <View style={{ width: PDP_METRICS.thumbLeft }} />
              )}

              <View
                style={[
                  styles.mainWrap,
                  { width: mainSize, height: mainSize },
                ]}
              >
                {current?.type === "image" ? (
                  <Image
                    source={{ uri: current.uri }}
                    style={styles.mainImg}
                    contentFit={PDP_METRICS.objectFit}
                    transition={150}
                    testID="listing-main-image"
                  />
                ) : current?.type === "video" ? (
                  <Pressable
                    style={styles.mainImg}
                    onPress={() => void Linking.openURL(current.uri)}
                    testID="listing-main-video"
                  >
                    {current.poster ? (
                      <Image
                        source={{ uri: current.poster }}
                        style={StyleSheet.absoluteFillObject}
                        contentFit="contain"
                      />
                    ) : (
                      <View style={[styles.mainImg, styles.mainPlaceholder]} />
                    )}
                    <View style={styles.playOverlay}>
                      <Feather name="play" size={28} color="#FFFFFF" />
                    </View>
                  </Pressable>
                ) : (
                  <View style={[styles.mainImg, styles.mainPlaceholder]}>
                    <Feather name="image" size={40} color="#94A3B8" />
                  </View>
                )}

                <View style={styles.overlayActions}>
                  <Pressable
                    style={styles.roundBtn}
                    onPress={() => void onShare()}
                    accessibilityLabel="Share"
                    testID="listing-share"
                  >
                    <Feather name="share-2" size={18} color="#0F172A" />
                  </Pressable>
                  <Pressable
                    style={styles.roundBtn}
                    onPress={() => void onToggleFavorite()}
                    accessibilityLabel={favorited ? "Unfavorite" : "Favorite"}
                    testID="listing-favorite"
                  >
                    <Feather
                      name="heart"
                      size={18}
                      color={favorited ? "#EF4444" : "#0F172A"}
                    />
                  </Pressable>
                </View>

                <Pressable
                  style={styles.similarBtn}
                  onPress={onSearchSimilar}
                  testID="listing-search-similar"
                >
                  <Feather name="search" size={14} color="#475569" />
                  <Text style={styles.similarText} numberOfLines={1}>
                    Search for similar items
                  </Text>
                </Pressable>
              </View>
            </View>

            {media.length > 0 ? (
              <View style={styles.counterRow}>
                <View style={styles.dots}>
                  {media.map((_, i) => (
                    <View
                      key={i}
                      style={[styles.dot, i === imageIndex && styles.dotOn]}
                    />
                  ))}
                </View>
                <Text style={styles.counter}>
                  {imageIndex + 1} / {media.length}
                </Text>
              </View>
            ) : null}

            <View style={styles.body}>
              <Text style={styles.title} testID="listing-title">
                {listing.title}
              </Text>

              {listing.sellerName ? (
                <Pressable
                  style={styles.sellerRow}
                  onPress={() => void onMessageSeller()}
                  testID="listing-seller"
                >
                  <Text style={styles.sellerText}>
                    Sold by {listing.sellerName}
                  </Text>
                  {listing.sellerIsVerified ? (
                    <Feather name="check-circle" size={14} color="#2563EB" />
                  ) : null}
                </Pressable>
              ) : null}

              <View style={styles.ratingRow} testID="listing-rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Feather
                    key={n}
                    name="star"
                    size={14}
                    color={n <= Math.round(rating) ? "#FBBF24" : "#CBD5E1"}
                  />
                ))}
                <Text style={styles.ratingNum}>{rating.toFixed(1)}</Text>
              </View>

              <Text style={styles.price} testID="listing-price">
                {money}
              </Text>

              {soldOut ? (
                <Text style={styles.soldOut}>Sold out</Text>
              ) : (
                <Text style={styles.inStock} testID="listing-stock-status">
                  in stock
                  {conditionLabel(listing.condition)
                    ? ` · ${conditionLabel(listing.condition)}`
                    : ""}
                </Text>
              )}

              <View style={styles.deliveryRow}>
                <Feather name="truck" size={16} color="#0F172A" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.deliveryText}>
                    Standard:{" "}
                    <Text style={styles.free}>FREE</Text>
                    {" "}(on orders $30.00+). Faster delivery in{" "}
                    <Text style={styles.bold}>2 BUSINESS DAYS</Text>.
                  </Text>
                  <Text style={styles.deliverySub}>
                    You selected {qty} item{qty === 1 ? "" : "s"} for free shipping
                  </Text>
                </View>
              </View>

              {stock != null ? (
                <View style={styles.stockBox} testID="listing-stock-qty">
                  <Feather name="package" size={16} color="#475569" />
                  <Text style={styles.stockBoxText}>
                    Current stock: {stock}
                  </Text>
                </View>
              ) : null}

              {listing.description?.trim() ? (
                <>
                  <Text style={styles.section}>Description</Text>
                  <Text style={styles.description}>{listing.description.trim()}</Text>
                </>
              ) : null}
            </View>
          </ScrollView>

          {!isOwnListing ? (
            <View
              style={[
                styles.purchaseBar,
                { paddingBottom: Math.max(insets.bottom, 8) },
              ]}
              onLayout={(e) => {
                const h = Math.ceil(e.nativeEvent.layout.height);
                if (h > 0 && h !== purchaseBarH) setPurchaseBarH(h);
              }}
              testID="listing-purchase-bar"
            >
              <View style={styles.qtyBox} testID="listing-qty">
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  accessibilityLabel="Decrease quantity"
                  testID="listing-qty-minus"
                >
                  <Feather name="minus" size={16} color="#0F172A" />
                </Pressable>
                <Text style={styles.qtyNum}>{qty}</Text>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() => setQty((q) => Math.min(maxQty, q + 1))}
                  disabled={qty >= maxQty || soldOut}
                  accessibilityLabel="Increase quantity"
                  testID="listing-qty-plus"
                >
                  <Feather name="plus" size={16} color="#0F172A" />
                </Pressable>
              </View>

              <Pressable
                style={[
                  styles.addCartBtn,
                  (inCart || addedFlash) && styles.addCartBtnInCart,
                  soldOut && styles.btnDisabled,
                ]}
                onPress={onAddToCart}
                disabled={soldOut}
                testID="listing-add-cart"
              >
                <Feather
                  name="shopping-cart"
                  size={winW < 360 ? 13 : 15}
                  color={inCart || addedFlash ? "#FFFFFF" : "#0F172A"}
                />
                <Text
                  style={[
                    styles.addCartText,
                    (inCart || addedFlash) && { color: "#FFFFFF" },
                    winW < 360 && { fontSize: 11 },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {addedFlash
                    ? "Added!"
                    : inCart
                      ? "In cart"
                      : "Add to Cart"}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.buyNowBtn, soldOut && styles.btnDisabled]}
                onPress={onBuyNow}
                disabled={soldOut}
                testID="listing-buy-now"
              >
                <Text style={styles.buyNowText}>Buy Now</Text>
                <Text style={styles.buyNowPrice} numberOfLines={1}>
                  {moneyLine}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View
              style={[
                styles.purchaseBar,
                { paddingBottom: Math.max(insets.bottom, 8) },
              ]}
              onLayout={(e) => {
                const h = Math.ceil(e.nativeEvent.layout.height);
                if (h > 0 && h !== purchaseBarH) setPurchaseBarH(h);
              }}
            >
              <Text style={styles.ownNote}>This is your listing</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  centered: { alignItems: "center", padding: 32, gap: 12 },
  error: { color: "#64748B", textAlign: "center" },
  retry: {
    backgroundColor: colors.flexaOrange,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontWeight: "800" },

  galleryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 8,
    paddingRight: PDP_METRICS.mainRightInset,
    gap: PDP_METRICS.gapThumbToMain,
  },
  thumbs: {
    width: PDP_METRICS.thumbLeft + THUMB,
  },
  thumbsInner: {
    paddingLeft: PDP_METRICS.thumbLeft,
    gap: PDP_METRICS.thumbGap,
    paddingBottom: 4,
  },
  // Web thumbs are rounded squares (~44), active = orange border
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#E2E8F0",
    backgroundColor: "#F1F5F9",
  },
  thumbActive: { borderColor: colors.flexaOrange },
  thumbImg: { width: "100%", height: "100%" },
  thumbPromo: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.flexaOrange,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 2,
  },
  thumbPromoText: { color: "#fff", fontSize: 8, fontWeight: "800" },
  mainWrap: {
    maxWidth: "100%",
    flexGrow: 1,
    flexShrink: 1,
    borderRadius: 4,
    backgroundColor: "rgba(241,245,249,0.5)",
    overflow: "hidden",
  },
  mainImg: { width: "100%", height: "100%" },
  mainPlaceholder: { alignItems: "center", justifyContent: "center" },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.35)",
  },
  overlayActions: {
    position: "absolute",
    top: 10,
    right: 10,
    gap: 8,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  // Web: absolute bottom-center over main image
  similarBtn: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.8)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  similarText: { fontSize: 11, fontWeight: "600", color: "#0F172A" },

  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  dots: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#CBD5E1",
  },
  dotOn: { backgroundColor: "#0F172A", width: 8, height: 8, borderRadius: 4 },
  counter: { fontSize: 12, color: "#64748B", fontWeight: "600" },

  body: { paddingHorizontal: 16, paddingTop: 4, gap: 8, paddingBottom: 16 },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 24,
  },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sellerText: { color: "#0066c0", fontWeight: "600", fontSize: 13 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingNum: { marginLeft: 4, color: "#64748B", fontSize: 13 },
  price: { fontSize: 26, fontWeight: "800", color: "#0F172A", marginTop: 2 },
  inStock: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.flexaGreen,
  },
  soldOut: { fontSize: 14, fontWeight: "800", color: "#DC2626" },
  deliveryRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 4 },
  deliveryText: { fontSize: 13, color: "#0F172A", lineHeight: 18, fontWeight: "600" },
  free: { color: colors.flexaGreen, fontWeight: "800" },
  bold: { fontWeight: "800" },
  deliverySub: { fontSize: 12, color: "#64748B", marginTop: 2 },
  stockBox: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  stockBoxText: { fontSize: 13, fontWeight: "700", color: "#334155" },
  section: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  description: { fontSize: 15, lineHeight: 22, color: "#334155" },

  // Web .fm-pdp-purchase-bar ≈ 61px, buttons 44px, pad 8×10, gap 6
  purchaseBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: PDP_METRICS.purchaseBarGap,
    paddingHorizontal: PDP_METRICS.purchaseBarPaddingH,
    paddingTop: PDP_METRICS.purchaseBarPaddingV,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
  },
  qtyBox: {
    flexDirection: "row",
    alignItems: "center",
    height: PDP_METRICS.purchaseBtnHeight,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F1F5F9",
    flexShrink: 1,
    maxWidth: 96,
  },
  qtyBtn: {
    width: 28,
    height: PDP_METRICS.purchaseBtnHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyNum: {
    minWidth: 16,
    textAlign: "center",
    fontWeight: "800",
    fontSize: 13,
    color: "#0F172A",
  },
  // Web Add to Cart ≈ 125 @390; keep flex share so label never truncates.
  addCartBtn: {
    flexGrow: 1.15,
    flexShrink: 1,
    flexBasis: 110,
    minWidth: 108,
    height: PDP_METRICS.purchaseBtnHeight,
    borderRadius: 999,
    backgroundColor: "#FFD814",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 6,
  },
  addCartBtnInCart: { backgroundColor: colors.flexaGreen },
  addCartText: {
    fontWeight: "800",
    fontSize: 12,
    color: "#0F172A",
    flexShrink: 1,
    maxWidth: "100%",
  },
  buyNowBtn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 96,
    minWidth: 88,
    height: PDP_METRICS.purchaseBtnHeight,
    borderRadius: 999,
    backgroundColor: colors.flexaOrange,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  buyNowText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  buyNowPrice: { color: "#FFFFFF", fontWeight: "700", fontSize: 10, opacity: 0.95 },
  btnDisabled: { opacity: 0.45 },
  ownNote: {
    flex: 1,
    textAlign: "center",
    fontWeight: "700",
    color: "#64748B",
    paddingVertical: 8,
  },
});
