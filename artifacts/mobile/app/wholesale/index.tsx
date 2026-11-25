import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import {
  fetchWholesaleProducts,
  formatMoney,
  type WholesaleProduct,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleCatalogScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<WholesaleProduct[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchWholesaleProducts({ q: q.trim() || undefined }, { token });
      setProducts(rows);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <WholesaleGate>
      <WholesaleShell
        headerRight={
          <Pressable
            style={styles.sellBtn}
            onPress={() => router.push("/wholesale/seller/new")}
            testID="wholesale-sell-cta"
          >
            <Feather name="plus" size={14} color={T.forest} />
            <Text style={styles.sellBtnText}>Sell</Text>
          </Pressable>
        }
      >
        <Text style={styles.lead}>
          Wholesale only — chat vendors in your country who stock a warehouse.
        </Text>
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            No buy button · chat the seller · depot in their country
          </Text>
        </View>

        <View style={styles.chips}>
          {[
            { label: "Categories", href: "/wholesale/categories" },
            { label: "Depots", href: "/wholesale/warehouses" },
            { label: "Search", href: "/wholesale/search" },
            { label: "How it works", href: "/wholesale/help" },
          ].map((c) => (
            <Pressable key={c.href} style={styles.chip} onPress={() => router.push(c.href as any)}>
              <Text style={styles.chipText}>{c.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.searchRow}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search wholesale products..."
            placeholderTextColor={T.muted}
            style={styles.search}
            returnKeyType="search"
            onSubmitEditing={() => void load()}
            testID="wholesale-search-input"
          />
          <Pressable style={styles.searchBtn} onPress={() => void load()}>
            <Feather name="search" size={18} color={T.white} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : products.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="package" size={28} color={T.accent} />
            <Text style={styles.emptyTitle}>No wholesale products yet</Text>
            <Text style={styles.emptyBody}>
              List bulk stock from your warehouse. Buyers contact you in chat — no checkout.
            </Text>
            <Pressable style={styles.primary} onPress={() => router.push("/wholesale/seller/new")}>
              <Text style={styles.primaryText}>+ Create wholesale product</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.grid}>
            {products.map((p) => (
              <Pressable
                key={p.id}
                style={styles.card}
                onPress={() => router.push(`/wholesale/products/${p.id}`)}
                testID={`wholesale-product-${p.id}`}
              >
                <View style={styles.thumbWrap}>
                  {p.images?.[0] ? (
                    <Image source={{ uri: p.images[0] }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Feather name="package" size={28} color={T.accent} />
                    </View>
                  )}
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>WHOLESALE</Text>
                  </View>
                </View>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {p.title}
                </Text>
                <Text style={styles.price}>
                  {formatMoney(p.unitPrice, p.currency)} / {p.wholesaleUnitType}
                </Text>
                <Text style={styles.meta}>
                  Min {p.minOrderQty} · {p.sellerName || "Seller"}
                </Text>
                {p.warehouseName ? (
                  <Text style={styles.depot} numberOfLines={1}>
                    {p.warehouseName}
                    {p.warehouseCity ? ` · ${p.warehouseCity}` : ""}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.footer}>Flexa Wholesale · chat-only · country warehouses</Text>
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 14, color: T.ink, fontWeight: "600", marginBottom: 10 },
  banner: {
    backgroundColor: T.accentSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  bannerText: { color: T.accent, fontSize: 12, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    backgroundColor: T.white,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  chipText: { fontSize: 12, fontWeight: "700", color: T.ink },
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  search: {
    flex: 1,
    backgroundColor: T.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: T.ink,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  searchBtn: {
    width: 46,
    borderRadius: 12,
    backgroundColor: T.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sellBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: T.white,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  sellBtnText: { color: T.forest, fontSize: 11, fontWeight: "800" },
  grid: { gap: 12 },
  card: {
    backgroundColor: T.white,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  thumbWrap: { position: "relative" },
  thumb: { width: "100%", height: 160, backgroundColor: T.mint },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  tag: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: T.forest,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: { color: T.white, fontSize: 10, fontWeight: "800" },
  cardTitle: { paddingHorizontal: 12, paddingTop: 10, fontSize: 15, fontWeight: "800", color: T.ink },
  price: { paddingHorizontal: 12, marginTop: 4, fontSize: 15, fontWeight: "800", color: T.accent },
  meta: { paddingHorizontal: 12, marginTop: 2, fontSize: 12, color: T.muted },
  depot: { paddingHorizontal: 12, paddingBottom: 12, marginTop: 4, fontSize: 12, color: T.muted },
  empty: {
    alignItems: "center",
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.line,
    backgroundColor: T.white,
  },
  emptyTitle: { marginTop: 10, fontSize: 15, fontWeight: "800", color: T.ink },
  emptyBody: { marginTop: 6, fontSize: 13, color: T.muted, textAlign: "center", lineHeight: 18 },
  primary: {
    marginTop: 14,
    backgroundColor: T.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryText: { color: T.white, fontWeight: "800", fontSize: 13 },
  error: { color: T.danger, marginTop: 16 },
  footer: { marginTop: 24, textAlign: "center", fontSize: 11, color: T.muted },
});
