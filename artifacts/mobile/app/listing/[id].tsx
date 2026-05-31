import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi, Listing } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function getReturnDays(country: string | null | undefined): number {
  const map: Record<string, number> = {
    "USA": 30, "Canada": 30, "Australia": 30,
    "United Kingdom": 14, "France": 14, "Germany": 14, "Italy": 14,
    "Netherlands": 14, "Belgium": 14, "Portugal": 14, "Switzerland": 14,
    "Sweden": 14, "Norway": 14, "Japan": 14, "South Korea": 14,
    "Brazil": 14, "Mexico": 14, "Colombia": 14, "Chile": 14, "South Africa": 14,
    "Jamaica": 7, "Trinidad and Tobago": 7, "Barbados": 7,
    "Bahamas": 7, "Puerto Rico": 7, "Haiti": 3, "Dominican Republic": 3,
    "Nigeria": 7, "Ghana": 7, "Kenya": 7, "Senegal": 7,
    "Philippines": 7, "India": 7, "United Arab Emirates": 7, "Saudi Arabia": 7,
  };
  return map[country ?? ""] ?? 14;
}

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
  const { user } = useAuth();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imgIndex, setImgIndex] = useState(0);
  const [favorited, setFavorited] = useState(false);

  // ── Stripe checkout state ──────────────────────────────────────────────────
  const [buyModalVisible, setBuyModalVisible] = useState(false);
  const [shippingName, setShippingName] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [buying, setBuying] = useState(false);
  const nameRef = useRef<TextInput>(null);

  useEffect(() => {
    request<Listing>(`/listings/${id}`)
      .then((data) => setListing(data))
      .catch(() => setError(t("listingNotFound")))
      .finally(() => setLoading(false));
  }, [id]);

  // Pre-fill user name from auth context
  useEffect(() => {
    if (user?.name) setShippingName(user.name);
  }, [user]);

  function handleFav() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFavorited((v) => !v);
    request(`/favorites/${id}`, { method: favorited ? "DELETE" : "POST" }).catch(() => {});
  }

  function handleBuyPress() {
    if (!user) {
      Alert.alert("Koneksyon obligatwa", "Konekte nan kont ou pou achte.", [
        { text: "Anile", style: "cancel" },
        { text: "Konekte", onPress: () => router.push("/auth/login") },
      ]);
      return;
    }
    if (listing?.sellerId === user.id) {
      Alert.alert("Pa posib", "Ou pa ka achte pwòp atik ou a.");
      return;
    }
    setBuyModalVisible(true);
    setTimeout(() => nameRef.current?.focus(), 400);
  }

  async function handleStripeCheckout() {
    if (!listing) return;
    if (!shippingName.trim()) {
      Alert.alert("Non obligatwa", "Tanpri antre non ou pou livrezon.");
      return;
    }

    setBuying(true);
    try {
      const data = await request<{ url: string; sessionId: string }>("/stripe/checkout", {
        method: "POST",
        body: JSON.stringify({
          listingId: listing.id,
          shippingName: shippingName.trim(),
          shippingPhone: shippingPhone.trim() || undefined,
          shippingCity: shippingCity.trim() || undefined,
          deliveryMethod: "standard",
        }),
      });

      if (!data?.url) {
        Alert.alert("Erè", "Nou pa ka kreye sesyon peman. Eseye ankò.");
        return;
      }

      setBuyModalVisible(false);
      await Linking.openURL(data.url);
    } catch (err: any) {
      Alert.alert("Erè peman", err?.message ?? "Erè enkoni. Eseye ankò.");
    } finally {
      setBuying(false);
    }
  }

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const conditionColor  = CONDITION_COLORS[listing?.condition?.toLowerCase() ?? ""] ?? colors.mutedForeground;
  const listingCountry  = (listing as any)?.country as string | null | undefined;
  const isLocalDelivery = listingCountry === "Haiti" || listingCountry === "Dominican Republic";
  const returnDays      = getReturnDays(listingCountry);
  const priceNum        = parseFloat(listing?.price ?? "0");

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
              ${priceNum.toLocaleString()}
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

          {listingCountry && (
            <View style={[styles.policySection, { borderTopColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LIVREZON &amp; RETOU</Text>

              <View style={[styles.policyCard, { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" }]}>
                <Text style={styles.policyIcon}>↩️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.policyTitle, { color: "#166534" }]}>{returnDays} jou retou garanti</Text>
                  <Text style={[styles.policyDesc, { color: "#15803D" }]}>Si pa kòrèk jan yo dekri l, retounen l gratis</Text>
                </View>
              </View>

              <View style={[styles.policyCard, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
                <Text style={styles.policyIcon}>{isLocalDelivery ? "🚗" : "📦"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.policyTitle, { color: "#1E3A8A" }]}>
                    {isLocalDelivery ? "Chofè FlexaMarket" : "USPS · DHL · FedEx · UPS"}
                  </Text>
                  <Text style={[styles.policyDesc, { color: "#1D4ED8" }]}>
                    {isLocalDelivery ? "Traking an tan reyèl · Kòd konfirmasyon" : "Transpòtè lokal ak traking"}
                  </Text>
                </View>
              </View>

              <View style={[styles.policyCard, { backgroundColor: "#FAF5FF", borderColor: "#E9D5FF" }]}>
                <Text style={styles.policyIcon}>🔒</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.policyTitle, { color: "#6B21A8" }]}>Peman pwoteje (Escrow)</Text>
                  <Text style={[styles.policyDesc, { color: "#7E22CE" }]}>Lajan ou lib sèlman apre ou konfime resepsyon</Text>
                </View>
              </View>
            </View>
          )}

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

      {/* ── Footer: Message · Offer · Buy ── */}
      <View style={[styles.footer, { paddingBottom: bottomPad + 8, backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.msgBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="message-circle" size={18} color={colors.foreground} />
          <Text style={[styles.msgText, { color: colors.foreground }]}>{t("listingContact")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.buyBtn]}
          onPress={handleBuyPress}
          activeOpacity={0.82}
        >
          <Feather name="credit-card" size={18} color="#FFF" />
          <Text style={styles.buyText}>Achte · ${priceNum.toLocaleString()}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Stripe Checkout Modal ── */}
      <Modal
        visible={buyModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBuyModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setBuyModalVisible(false)} />
          <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Konfime Acha</Text>
              <TouchableOpacity onPress={() => setBuyModalVisible(false)} style={styles.modalClose}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Listing summary */}
            <View style={[styles.listingSummary, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.listingSummaryTitle, { color: colors.foreground }]} numberOfLines={2}>{listing.title}</Text>
                <Text style={[styles.listingSummarySub, { color: colors.mutedForeground }]}>
                  {listing.condition} · {listing.category}
                </Text>
              </View>
              <Text style={[styles.listingSummaryPrice, { color: colors.primary }]}>${priceNum.toLocaleString()}</Text>
            </View>

            {/* Shipping fields */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Non pou livrezon *</Text>
            <TextInput
              ref={nameRef}
              style={[styles.field, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Non konplè..."
              placeholderTextColor={colors.mutedForeground}
              value={shippingName}
              onChangeText={setShippingName}
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Nimewo telefòn (opsyonèl)</Text>
            <TextInput
              style={[styles.field, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="+509 ..."
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              value={shippingPhone}
              onChangeText={setShippingPhone}
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Vil livrezon (opsyonèl)</Text>
            <TextInput
              style={[styles.field, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Port-au-Prince, Miami..."
              placeholderTextColor={colors.mutedForeground}
              value={shippingCity}
              onChangeText={setShippingCity}
              returnKeyType="done"
              onSubmitEditing={handleStripeCheckout}
            />

            <Text style={[styles.stripeNote, { color: colors.mutedForeground }]}>
              🔒 Peman pwoteje pa Stripe · Visa · Mastercard · AMEX
            </Text>

            <TouchableOpacity
              style={[styles.checkoutBtn, { opacity: buying ? 0.7 : 1 }]}
              onPress={handleStripeCheckout}
              disabled={buying}
              activeOpacity={0.85}
            >
              {buying ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="credit-card" size={18} color="#fff" />
                  <Text style={styles.checkoutBtnText}>Peye ${priceNum.toLocaleString()} ak Stripe</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  policySection: { borderTopWidth: 1, paddingTop: 16, gap: 8 },
  sectionLabel:  { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5, marginBottom: 4 },
  policyCard:    { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  policyIcon:    { fontSize: 22 },
  policyTitle:   { fontSize: 13, fontFamily: "Inter_700Bold" },
  policyDesc:    { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
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
  // ── Footer ──
  footer: { flexDirection: "row", padding: 16, borderTopWidth: 1, gap: 10 },
  msgBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, borderWidth: 1 },
  msgText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  buyBtn: {
    flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, height: 50, borderRadius: 14,
    backgroundColor: "#2563EB",
    shadowColor: "#2563EB", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },
  buyText: { color: "#FFF", fontSize: 15, fontFamily: "Inter_700Bold" },
  // ── Modal ──
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 12 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalClose: { padding: 4 },
  listingSummary: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 20 },
  listingSummaryTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  listingSummarySub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  listingSummaryPrice: { fontSize: 20, fontFamily: "Inter_700Bold" },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6, letterSpacing: 0.3 },
  field: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 14 },
  stripeNote: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 18, lineHeight: 17 },
  checkoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, borderRadius: 16, padding: 16,
    backgroundColor: "#2563EB",
    shadowColor: "#2563EB", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },
  checkoutBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
