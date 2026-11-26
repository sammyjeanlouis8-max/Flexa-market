import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import {
  addFavorite,
  fetchWholesaleProduct,
  formatMoney,
  priceForQty,
  removeFavorite,
  startWholesaleChat,
  type WholesaleProduct,
} from "@/lib/wholesaleApi";
import { pushRecentProduct } from "@/lib/wholesaleDraft";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleProductScreen() {
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const { token, user } = useAuth();
  const router = useRouter();
  const [product, setProduct] = useState<WholesaleProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [chatting, setChatting] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    if (!token || !Number.isFinite(productId)) return;
    let alive = true;
    setLoading(true);
    fetchWholesaleProduct(productId, { token, country: user?.country || undefined })
      .then((p) => {
        if (!alive) return;
        setProduct(p);
        setQty(Math.max(1, p.minOrderQty || 1));
        setHeroIndex(0);
        void pushRecentProduct(p.id);
      })
      .catch((e) => {
        if (alive) Alert.alert("Error", e?.message || "Not found");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, productId, user?.country]);

  const unit = useMemo(() => (product ? priceForQty(product, qty) : 0), [product, qty]);
  const total = unit * qty;
  const images = product?.images ?? [];
  const heroUri = images[heroIndex] || images[0];
  const place = product ? [product.city, product.country].filter(Boolean).join(" · ") : "";
  const depotLabel =
    product?.warehouseName ||
    product?.warehouse?.name ||
    (product?.offersWarehousePickup ? "Warehouse pickup available" : null);

  const onChat = async () => {
    if (!token || !product) return;
    const isSa = !!(user as any)?.isSuperAdmin || (user as any)?.role === "superadmin";
    if (user?.id === product.sellerId && !isSa) {
      Alert.alert("That's your listing", "Open Seller to edit this product.");
      return;
    }
    setChatting(true);
    try {
      const { saveWholesaleNavContext } = await import("@/lib/wholesaleNavContext");
      await saveWholesaleNavContext(
        {
          path: `/wholesale/products/${product.id}`,
          productId: product.id,
        },
        { markChatReturn: true },
      );
      const conv = await startWholesaleChat(
        {
          sellerId: product.sellerId,
          productId: product.id,
          productTitle: product.title,
          qty,
        },
        { token },
      );
      router.push(`/chat/${conv.id}`);
    } catch (e: any) {
      Alert.alert("Chat", e?.message || t("wholesale_chatFailed"));
    } finally {
      setChatting(false);
    }
  };

  const onToggleFavorite = async () => {
    if (!token || !product) return;
    try {
      if (favorited) {
        await removeFavorite(product.id, { token });
        setFavorited(false);
      } else {
        await addFavorite(product.id, { token, country: user?.country || product.country || undefined });
        setFavorited(true);
      }
    } catch (e: any) {
      Alert.alert("Favorites", e?.message || "Could not update favorite");
    }
  };

  return (
    <WholesaleGate>
      <WholesaleShell
        title={product?.title}
        subtitle={product ? t("wholesale_productSubtitle") : undefined}
        headerRight={
          product ? (
            <Pressable onPress={() => void onToggleFavorite()} testID="wholesale-favorite-toggle">
              <Feather name="heart" size={20} color={favorited ? T.danger : T.forest} />
            </Pressable>
          ) : undefined
        }
      >
        {loading || !product ? (
          <ActivityIndicator color={T.accent} />
        ) : (
          <View style={styles.wrap}>
            <View style={styles.galleryCard}>
              {heroUri ? (
                <Image source={{ uri: heroUri }} style={styles.hero} contentFit="cover" />
              ) : (
                <View style={[styles.hero, styles.heroEmpty]}>
                  <Feather name="package" size={40} color={T.accent} />
                </View>
              )}
              {images.length > 1 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.thumbs}
                >
                  {images.map((src, i) => (
                    <Pressable key={`${src}-${i}`} onPress={() => setHeroIndex(i)}>
                      <Image
                        source={{ uri: src }}
                        style={[styles.thumb, i === heroIndex && styles.thumbOn]}
                        contentFit="cover"
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
            </View>

            <Text style={styles.tags}>
              {(product.category || t("wholesale_bulkBadge")).toUpperCase()} · WHOLESALE ONLY
            </Text>
            <Text style={styles.seller}>
              {product.sellerName || "Seller"}
              {place ? ` · ${place}` : ""}
            </Text>

            <View style={styles.card}>
              <Text style={styles.price}>
                {formatMoney(unit, product.currency)}
                <Text style={styles.priceUnit}> / {product.wholesaleUnitType}</Text>
              </Text>
              {product.tiers?.length ? (
                <View style={styles.tiers}>
                  {product.tiers.map((tier) => (
                    <View
                      key={tier.id ?? `${tier.minQuantity}-${tier.unitPrice}`}
                      style={styles.tierRow}
                    >
                      <Text style={styles.tierLabel}>
                        {tier.minQuantity}
                        {tier.maxQuantity != null ? `–${tier.maxQuantity}` : "+"}{" "}
                        {product.wholesaleUnitType}
                      </Text>
                      <Text style={styles.tierPrice}>
                        {formatMoney(tier.unitPrice, product.currency)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>{t("wholesale_quantity").toUpperCase()}</Text>
              <View style={styles.qtyRow}>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() => setQty((q) => Math.max(product.minOrderQty, q - 1))}
                >
                  <Feather name="minus" size={16} color={T.ink} />
                </Pressable>
                <Text style={styles.qty}>{qty}</Text>
                <Pressable style={styles.qtyBtn} onPress={() => setQty((q) => q + 1)}>
                  <Feather name="plus" size={16} color={T.ink} />
                </Pressable>
              </View>
              <Text style={styles.meta}>
                {t("wholesale_minOrder")} {product.minOrderQty} · {t("wholesale_stock")}{" "}
                {product.stockQuantity}
              </Text>
              <Text style={styles.total}>
                {t("wholesale_quoteTotal")}: {formatMoney(total, product.currency)}
              </Text>
              <Text style={styles.hint}>{t("wholesale_chatOnlyHint")}</Text>
            </View>

            <Pressable
              style={[styles.cta, chatting && { opacity: 0.7 }]}
              onPress={() => void onChat()}
              disabled={chatting}
              testID="wholesale-chat-seller"
            >
              {chatting ? (
                <ActivityIndicator color={T.white} />
              ) : (
                <>
                  <Feather name="message-circle" size={18} color={T.white} />
                  <Text style={styles.ctaText}>{t("wholesale_contactSeller")}</Text>
                </>
              )}
            </Pressable>

            {(depotLabel || place) ? (
              <View style={styles.depotCard}>
                {depotLabel ? (
                  <View style={styles.depotRow}>
                    <Feather name="home" size={14} color={T.accent} />
                    <Text style={styles.depotTitle}>
                      {product.warehouse?.name || product.warehouseName || depotLabel}
                      {product.warehouse?.city || product.warehouseCity
                        ? ` · ${product.warehouse?.city || product.warehouseCity}`
                        : ""}
                    </Text>
                  </View>
                ) : null}
                {place ? (
                  <View style={styles.depotRow}>
                    <Feather name="map-pin" size={14} color={T.accent} />
                    <Text style={styles.depotMeta}>
                      {t("wholesale_sellsInCountry")} {place}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {product.description ? (
              <View style={styles.card}>
                <Text style={styles.descLabel}>{t("wholesale_description")}</Text>
                <Text style={styles.desc}>{product.description}</Text>
              </View>
            ) : null}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  galleryCard: {
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    backgroundColor: T.white,
  },
  hero: { width: "100%", height: 220, backgroundColor: T.mint },
  heroEmpty: { alignItems: "center", justifyContent: "center" },
  thumbs: { padding: 10, gap: 8 },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: T.mint,
    borderWidth: 2,
    borderColor: "transparent",
  },
  thumbOn: { borderColor: T.accent },
  tags: { fontSize: 11, fontWeight: "800", color: T.accent, letterSpacing: 0.4 },
  seller: { fontSize: 13, color: T.muted, marginTop: -4 },
  card: {
    backgroundColor: T.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  price: { fontSize: 24, fontWeight: "800", color: T.accent },
  priceUnit: { fontSize: 13, fontWeight: "600", color: T.muted },
  tiers: { marginTop: 12, gap: 8 },
  tierRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  tierLabel: { fontSize: 13, color: T.muted, flex: 1 },
  tierPrice: { fontSize: 13, fontWeight: "700", color: T.ink },
  label: {
    fontSize: 11,
    fontWeight: "800",
    color: T.muted,
    letterSpacing: 0.5,
  },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: T.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    alignItems: "center",
    justifyContent: "center",
  },
  qty: { fontSize: 18, fontWeight: "800", color: T.ink, minWidth: 28, textAlign: "center" },
  meta: { fontSize: 12, color: T.muted, marginTop: 8 },
  total: { marginTop: 10, fontSize: 16, fontWeight: "800", color: T.ink },
  hint: { marginTop: 4, fontSize: 12, color: T.muted },
  cta: {
    backgroundColor: T.accent,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaText: { color: T.white, fontSize: 15, fontWeight: "800" },
  depotCard: {
    backgroundColor: T.accentSoft,
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    gap: 8,
  },
  depotRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  depotTitle: { flex: 1, fontSize: 13, fontWeight: "700", color: T.accent },
  depotMeta: { flex: 1, fontSize: 12, color: T.accent },
  descLabel: { fontSize: 14, fontWeight: "800", color: T.ink },
  desc: { marginTop: 8, fontSize: 14, color: T.muted, lineHeight: 20 },
});
