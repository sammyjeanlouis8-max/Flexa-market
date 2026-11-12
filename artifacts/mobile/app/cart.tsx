/**
 * Native shopping cart — AsyncStorage persistence + country filtering.
 * Checkout continues on /checkout (wallet / Card FM only).
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useCart, type CartItem } from "@/context/CartContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import {
  cartHasDominicanItems,
  isDominicanListingCountry,
} from "@/lib/checkoutApi";

const QTY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30];

function formatMoney(amount: number, currency: string | null) {
  const symbol = currency === "HTG" ? "G" : currency === "DOP" ? "RD$" : "$";
  return `${symbol}${amount.toLocaleString(undefined, {
    minimumFractionDigits: amount % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token, isLoading: authLoading } = useAuth();
  const { country } = useMarketplace();
  const {
    items,
    ready,
    removeItem,
    clearCart,
    updateQuantity,
    itemsForCountry,
  } = useCart();

  const visibleItems = useMemo(
    () => itemsForCountry(country),
    [itemsForCountry, country],
  );
  const hiddenCount = items.length - visibleItems.length;

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectionReady, setSelectionReady] = useState(false);
  const [qtyPickerFor, setQtyPickerFor] = useState<number | null>(null);

  // Prune removed lines; select all on first cart load.
  React.useEffect(() => {
    if (!ready) return;
    const ids = new Set(visibleItems.map((i) => i.listingId));
    if (!selectionReady) {
      setSelected(new Set(ids));
      setSelectionReady(true);
      return;
    }
    setSelected((prev) => new Set([...prev].filter((id) => ids.has(id))));
  }, [visibleItems, ready, selectionReady]);

  const selectedItems = useMemo(
    () => visibleItems.filter((i) => selected.has(i.listingId)),
    [visibleItems, selected],
  );
  const subtotal = useMemo(
    () =>
      Math.round(
        selectedItems.reduce((s, i) => s + i.price * i.quantity, 0) * 100,
      ) / 100,
    [selectedItems],
  );
  const hasDominican = cartHasDominicanItems(selectedItems);

  const toggleSelect = (listingId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(listingId)) next.delete(listingId);
      else next.add(listingId);
      return next;
    });
  };

  const onClear = () => {
    Alert.alert("Clear cart?", "Remove all items from your cart.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          clearCart();
          setSelected(new Set());
        },
      },
    ]);
  };

  const onCheckout = () => {
    if (selectedItems.length === 0) {
      Alert.alert("Select items", "Choose at least one item to checkout.");
      return;
    }
    if (!token || !user) {
      router.push("/auth/login");
      return;
    }
    if (hasDominican) {
      Alert.alert(
        "Individual checkout required",
        "Dominican Republic listings must be purchased on the product page so you can choose the seller’s shipping options. Cart wallet checkout is not available for those items.",
      );
      return;
    }
    const ids = selectedItems.map((i) => i.listingId).join(",");
    router.push({ pathname: "/checkout", params: { ids } });
  };

  const renderItem = ({ item }: { item: CartItem }) => {
    const checked = selected.has(item.listingId);
    const dominican = isDominicanListingCountry(item.country);
    return (
      <View style={[styles.row, dominican && styles.rowWarn]}>
        <Pressable
          onPress={() => toggleSelect(item.listingId)}
          style={styles.check}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
        >
          <Feather
            name={checked ? "check-square" : "square"}
            size={22}
            color={checked ? "#F97316" : "#94A3B8"}
          />
        </Pressable>
        <Pressable
          style={styles.thumbWrap}
          onPress={() => router.push(`/listing/${item.listingId}`)}
        >
          {item.image ? (
            <Image
              source={{ uri: item.image }}
              style={styles.thumb}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Feather name="image" size={18} color="#94A3B8" />
            </View>
          )}
        </Pressable>
        <View style={styles.meta}>
          <Pressable onPress={() => router.push(`/listing/${item.listingId}`)}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
          </Pressable>
          {item.variantLabel ? (
            <Text style={styles.warnText}>{item.variantLabel}</Text>
          ) : null}
          <Text style={styles.price}>
            {formatMoney(item.price, item.currency)}
          </Text>
          {dominican ? (
            <Text style={styles.warnText}>Buy on listing page</Text>
          ) : null}
          <View style={styles.qtyRow}>
            <Pressable
              style={styles.qtyBtn}
              onPress={() => setQtyPickerFor(item.listingId)}
            >
              <Text style={styles.qtyBtnText}>Qty {item.quantity}</Text>
              <Feather name="chevron-down" size={14} color="#475569" />
            </Pressable>
            <Pressable
              onPress={() => removeItem(item.listingId, item.variantId)}
              hitSlop={8}
              accessibilityLabel="Remove from cart"
            >
              <Feather name="trash-2" size={18} color="#EF4444" />
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.topTitle}>Cart</Text>
        {items.length > 0 ? (
          <Pressable onPress={onClear} hitSlop={8}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : (
          <View style={{ width: 48 }} />
        )}
      </View>

      {!ready || authLoading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 48 }} />
      ) : visibleItems.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="shopping-cart" size={40} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySub}>
            {hiddenCount > 0
              ? `${hiddenCount} item(s) are hidden because they belong to another marketplace country (${country}).`
              : "Browse listings and tap Add to Cart."}
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.replace("/")}>
            <Text style={styles.primaryBtnText}>Continue shopping</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {hiddenCount > 0 ? (
            <Text style={styles.countryNote}>
              Showing {visibleItems.length} for {country}. {hiddenCount} item(s)
              from other countries are hidden.
            </Text>
          ) : null}
          <FlatList
            data={visibleItems}
            keyExtractor={(item) =>
              `${item.listingId}:${item.variantId ?? "base"}`
            }
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 140, paddingHorizontal: 12 }}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          />

          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            <View style={styles.footerMeta}>
              <Text style={styles.footerLabel}>
                {selectedItems.length} selected · Subtotal
              </Text>
              <Text style={styles.footerTotal}>${subtotal.toFixed(2)}</Text>
            </View>
            {hasDominican ? (
              <Text style={styles.footerWarn}>
                Remove Dominican items or open each listing to checkout.
              </Text>
            ) : null}
            <Pressable
              style={[
                styles.checkoutBtn,
                (selectedItems.length === 0 || hasDominican) &&
                  styles.checkoutBtnDisabled,
              ]}
              onPress={onCheckout}
              disabled={selectedItems.length === 0 || hasDominican}
            >
              <Text style={styles.checkoutBtnText}>
                {!token ? "Sign in to checkout" : "Checkout"}
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {qtyPickerFor != null ? (
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setQtyPickerFor(null)}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.sheetTitle}>Quantity</Text>
            <View style={styles.qtyGrid}>
              {QTY_OPTIONS.map((q) => (
                <Pressable
                  key={q}
                  style={styles.qtyChip}
                  onPress={() => {
                    updateQuantity(qtyPickerFor, q);
                    setQtyPickerFor(null);
                  }}
                >
                  <Text style={styles.qtyChipText}>{q}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      ) : null}
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
  topTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  clearText: { color: "#EF4444", fontWeight: "700", fontSize: 14, width: 48 },
  countryNote: {
    marginHorizontal: 16,
    marginBottom: 8,
    color: "#64748B",
    fontSize: 12,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  emptySub: { fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 20 },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  primaryBtnText: { color: "#fff", fontWeight: "800" },
  row: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  rowWarn: { borderColor: "#FDBA74", backgroundColor: "#FFF7ED" },
  check: { paddingTop: 8 },
  thumbWrap: { borderRadius: 12, overflow: "hidden" },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: "#E2E8F0" },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  meta: { flex: 1, gap: 4 },
  title: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  price: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  warnText: { fontSize: 11, fontWeight: "700", color: "#C2410C" },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  qtyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  qtyBtnText: { fontSize: 13, fontWeight: "700", color: "#334155" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  footerMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerLabel: { color: "#64748B", fontSize: 13, fontWeight: "600" },
  footerTotal: { fontSize: 20, fontWeight: "900", color: "#0F172A" },
  footerWarn: { color: "#C2410C", fontSize: 12, fontWeight: "600" },
  checkoutBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  checkoutBtnDisabled: { backgroundColor: "#E2E8F0" },
  checkoutBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 12,
  },
  qtyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  qtyChip: {
    width: 48,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyChipText: { fontWeight: "800", color: "#0F172A" },
});
