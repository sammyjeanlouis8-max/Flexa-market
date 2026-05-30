import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi, Listing } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const CONDITION_COLORS: Record<string, string> = {
  new: "#22C55E",
  "like new": "#16A34A",
  good: "#3B82F6",
  fair: "#F59E0B",
  poor: "#EF4444",
};

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const { t } = useLanguage();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imgIndex, setImgIndex] = useState(0);
  const [favorited, setFavorited] = useState(false);

  useEffect(() => {
    request<Listing>(`/listings/${id}`)
      .then((data) => setListing(data))
      .catch(() => setError(t("listingNotFound")))
      .finally(() => setLoading(false));
  }, [id]);

  function handleFav() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFavorited((v) => !v);
    request(`/favorites/${id}`, { method: favorited ? "DELETE" : "POST" }).catch(() => {});
  }

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const conditionColor = CONDITION_COLORS[listing?.condition?.toLowerCase() ?? ""] ?? colors.mutedForeground;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !listing) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={[styles.errorText, { color: colors.foreground }]}>{error || t("listingLoadErr")}</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backPill, { backgroundColor: colors.muted }]}>
          <Text style={[styles.backPillText, { color: colors.foreground }]}>{t("back")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const images = listing.images?.length > 0 ? listing.images : [];
  const seller = listing.seller;
  const initials = seller?.name?.slice(0, 2).toUpperCase() ?? "?";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomPad + 100 }}>
        <View style={styles.imageSection}>
          {images.length > 0 ? (
            <>
              <FlatList
                data={images}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(_, i) => String(i)}
                renderItem={({ item }) => (
                  <Image source={{ uri: item }} style={styles.heroImage} contentFit="cover" />
                )}
                onScroll={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                  setImgIndex(idx);
                }}
                scrollEventThrottle={16}
              />
              {images.length > 1 && (
                <View style={styles.dotRow}>
                  {images.map((_, i) => (
                    <View key={i} style={[styles.dot, { backgroundColor: i === imgIndex ? "#FFF" : "rgba(255,255,255,0.4)" }]} />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={[styles.heroImage, styles.imagePlaceholder, { backgroundColor: colors.muted }]}>
              <Feather name="image" size={48} color={colors.mutedForeground} />
            </View>
          )}

          <TouchableOpacity style={[styles.backBtn, { backgroundColor: "rgba(0,0,0,0.4)" }]} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.heartBtn, { backgroundColor: "rgba(0,0,0,0.4)" }]} onPress={handleFav}>
            <Feather name="heart" size={20} color={favorited ? "#EF4444" : "#FFF"} />
          </TouchableOpacity>
        </View>

        <View style={[styles.content, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.foreground }]}>
              ${parseFloat(listing.price || "0").toLocaleString()}
            </Text>
            {listing.isBoosted && (
              <View style={[styles.boostedBadge, { backgroundColor: colors.accent }]}>
                <Text style={styles.boostedText}>{t("sponsored")}</Text>
              </View>
            )}
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>{listing.title}</Text>

          <View style={styles.metaRow}>
            <View style={[styles.condBadge, { backgroundColor: conditionColor + "20", borderColor: conditionColor }]}>
              <View style={[styles.condDot, { backgroundColor: conditionColor }]} />
              <Text style={[styles.condText, { color: conditionColor }]}>{listing.condition}</Text>
            </View>
            {listing.category && (
              <View style={[styles.catBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.catText, { color: colors.mutedForeground }]}>{listing.category}</Text>
              </View>
            )}
          </View>

          <View style={[styles.locationRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
            <Feather name="map-pin" size={14} color={colors.mutedForeground} />
            <Text style={[styles.locationText, { color: colors.mutedForeground }]}>
              {[listing.city, listing.location, listing.country].filter(Boolean).join(", ")}
            </Text>
          </View>

          {listing.description ? (
            <View style={styles.descSection}>
              <Text style={[styles.descLabel, { color: colors.foreground }]}>{t("description")}</Text>
              <Text style={[styles.descText, { color: colors.mutedForeground }]}>{listing.description}</Text>
            </View>
          ) : null}

          {seller && (
            <View style={[styles.sellerSection, { borderTopColor: colors.border }]}>
              <Text style={[styles.sellerLabel, { color: colors.foreground }]}>{t("seller")}</Text>
              <View style={styles.sellerRow}>
                {seller.avatarUrl ? (
                  <Image source={{ uri: seller.avatarUrl }} style={styles.sellerAvatar} contentFit="cover" />
                ) : (
                  <View style={[styles.sellerAvatarFallback, { backgroundColor: colors.primary }]}>
                    <Text style={styles.sellerInitials}>{initials}</Text>
                  </View>
                )}
                <View style={styles.sellerInfo}>
                  <Text style={[styles.sellerName, { color: colors.foreground }]}>{seller.name}</Text>
                  {seller.city && (
                    <Text style={[styles.sellerCity, { color: colors.mutedForeground }]}>{seller.city}</Text>
                  )}
                </View>
                <TouchableOpacity style={[styles.viewProfileBtn, { borderColor: colors.border }]}>
                  <Text style={[styles.viewProfileText, { color: colors.primary }]}>{t("profile")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad + 8, backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.msgBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="message-circle" size={18} color={colors.foreground} />
          <Text style={[styles.msgText, { color: colors.foreground }]}>{t("listingContact")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.offerBtn, { backgroundColor: colors.accent }]}>
          <Feather name="tag" size={18} color="#FFF" />
          <Text style={styles.offerText}>{t("listingOffer")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  backPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  backPillText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  imageSection: { position: "relative", width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.75 },
  heroImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.75 },
  imagePlaceholder: { alignItems: "center", justifyContent: "center" },
  dotRow: { position: "absolute", bottom: 12, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  backBtn: { position: "absolute", top: 48, left: 16, width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  heartBtn: { position: "absolute", top: 48, right: 16, width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  content: { margin: 12, borderRadius: 20, borderWidth: 1, padding: 20, gap: 12 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  price: { fontSize: 26, fontFamily: "Inter_700Bold" },
  boostedBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  boostedText: { color: "#FFF", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  title: { fontSize: 18, fontFamily: "Inter_600SemiBold", lineHeight: 26 },
  metaRow: { flexDirection: "row", gap: 8 },
  condBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  condDot: { width: 7, height: 7, borderRadius: 4 },
  condText: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  catBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  catText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 12 },
  locationText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  descSection: { gap: 8 },
  descLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  descText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  sellerSection: { borderTopWidth: 1, paddingTop: 16, gap: 12 },
  sellerLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sellerAvatar: { width: 44, height: 44, borderRadius: 22 },
  sellerAvatarFallback: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  sellerInitials: { color: "#FFF", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sellerInfo: { flex: 1 },
  sellerName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sellerCity: { fontSize: 12, fontFamily: "Inter_400Regular" },
  viewProfileBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  viewProfileText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  footer: { flexDirection: "row", padding: 16, borderTopWidth: 1, gap: 12 },
  msgBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, borderWidth: 1 },
  msgText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  offerBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14 },
  offerText: { color: "#FFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
