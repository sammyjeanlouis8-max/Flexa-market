import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const { token, user } = useAuth();
  const router = useRouter();
  const [product, setProduct] = useState<WholesaleProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [chatting, setChatting] = useState(false);
  const [favorited, setFavorited] = useState(false);

  useEffect(() => {
    if (!token || !Number.isFinite(productId)) return;
    let alive = true;
    setLoading(true);
    fetchWholesaleProduct(productId, { token, country: user?.country || undefined })
      .then((p) => {
        if (!alive) return;
        setProduct(p);
        setQty(Math.max(1, p.minOrderQty || 1));
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

  const onChat = async () => {
    if (!token || !product) return;
    if (user?.id === product.sellerId) {
      Alert.alert("That's your listing", "Open Seller to edit this product.");
      return;
    }
    setChatting(true);
    try {
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
      Alert.alert("Chat", e?.message || "Could not start chat");
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
        subtitle={product ? "Wholesale listing · chat seller · depot pickup" : undefined}
        headerRight={
          product ? (
            <Pressable onPress={() => void onToggleFavorite()} testID="wholesale-favorite-toggle">
              <Feather name={favorited ? "heart" : "heart"} size={20} color={favorited ? T.danger : T.forest} />
            </Pressable>
          ) : undefined
        }
      >
        {loading || !product ? (
          <ActivityIndicator color={T.accent} />
        ) : (
          <View style={styles.wrap}>
            {product.images?.[0] ? (
              <Image source={{ uri: product.images[0] }} style={styles.hero} contentFit="cover" />
            ) : (
              <View style={[styles.hero, styles.heroEmpty]}>
                <Feather name="package" size={40} color={T.accent} />
              </View>
            )}
            <Text style={styles.tags}>
              {(product.category || "Wholesale").toUpperCase()} · WHOLESALE ONLY
            </Text>
            <Text style={styles.seller}>
              {product.sellerName || "Seller"}
              {product.city ? ` · ${product.city}` : ""}
              {product.country ? ` · ${product.country}` : ""}
            </Text>
            <Text style={styles.price}>
              {formatMoney(unit, product.currency)} / {product.wholesaleUnitType}
            </Text>

            <Text style={styles.label}>QUANTITY</Text>
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
              Min {product.minOrderQty} · Stock {product.stockQuantity}
            </Text>
            <Text style={styles.total}>Quote total: {formatMoney(total, product.currency)}</Text>
            <Text style={styles.hint}>No online checkout — negotiate and confirm in chat.</Text>

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
                  <Text style={styles.ctaText}>Chat with seller</Text>
                </>
              )}
            </Pressable>

            {(product.warehouseName || product.warehouse) ? (
              <Text style={styles.depot}>
                Depot: {product.warehouse?.name || product.warehouseName}
                {product.warehouse?.city || product.warehouseCity
                  ? ` · ${product.warehouse?.city || product.warehouseCity}`
                  : ""}
                {product.warehouse?.country || product.country
                  ? ` · ${product.warehouse?.country || product.country}`
                  : ""}
              </Text>
            ) : null}
            {product.tiers?.length ? (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.descLabel}>Volume pricing</Text>
                {product.tiers.map((tier) => (
                  <Text key={tier.id ?? `${tier.minQuantity}-${tier.unitPrice}`} style={styles.meta}>
                    {tier.minQuantity}
                    {tier.maxQuantity != null ? `–${tier.maxQuantity}` : "+"} →{" "}
                    {formatMoney(tier.unitPrice, product.currency)}
                  </Text>
                ))}
              </View>
            ) : null}
            {product.description ? (
              <>
                <Text style={styles.descLabel}>Description</Text>
                <Text style={styles.desc}>{product.description}</Text>
              </>
            ) : null}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  hero: { width: "100%", height: 220, borderRadius: 16, backgroundColor: T.mint },
  heroEmpty: { alignItems: "center", justifyContent: "center" },
  tags: { marginTop: 12, fontSize: 11, fontWeight: "800", color: T.accent, letterSpacing: 0.4 },
  seller: { fontSize: 13, color: T.muted },
  price: { marginTop: 6, fontSize: 24, fontWeight: "800", color: T.accent },
  label: {
    marginTop: 14,
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
  meta: { fontSize: 12, color: T.muted, marginTop: 4 },
  total: { marginTop: 10, fontSize: 16, fontWeight: "800", color: T.ink },
  hint: { marginTop: 4, fontSize: 12, color: T.muted },
  cta: {
    marginTop: 16,
    backgroundColor: T.accent,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaText: { color: T.white, fontSize: 15, fontWeight: "800" },
  depot: { marginTop: 12, fontSize: 13, color: T.muted },
  descLabel: { marginTop: 18, fontSize: 14, fontWeight: "800", color: T.ink },
  desc: { marginTop: 6, fontSize: 14, color: T.muted, lineHeight: 20 },
});
