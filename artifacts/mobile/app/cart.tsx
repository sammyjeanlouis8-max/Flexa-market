import { StateView } from "@/components/StateView";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { cartSubtotal } from "@/lib/checkoutMath";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function CartScreen() {
  const { token, user } = useAuth();
  const { items, removeItem, updateQuantity, clearCart, ready, subtotal } = useCart();
  const { country } = useMarketplace();
  const [verifying, setVerifying] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  useAndroidBack();

  const verifyAvailability = useCallback(async () => {
    if (!items.length) {
      setWarnings([]);
      return;
    }
    setVerifying(true);
    const nextWarnings: string[] = [];
    try {
      for (const item of items) {
        const res = await apiFetch(`/listings/${item.listingId}`, {
          token,
          auth: Boolean(token),
        });
        if (res.status === 404) {
          nextWarnings.push(`“${item.title}” is no longer available.`);
          removeItem(item.listingId);
          continue;
        }
        if (!res.ok) continue;
        const data = await res.json();
        if (data.status && data.status !== "available") {
          nextWarnings.push(`“${item.title}” is not available (${data.status}).`);
          removeItem(item.listingId);
          continue;
        }
        if (user?.country && data.country && data.country !== user.country) {
          nextWarnings.push(`“${item.title}” is outside your marketplace country.`);
        }
        if (typeof data.stockQuantity === "number" && data.stockQuantity <= 0) {
          nextWarnings.push(`“${item.title}” is out of stock.`);
          removeItem(item.listingId);
        } else if (
          typeof data.stockQuantity === "number" &&
          (item.quantity || 1) > data.stockQuantity
        ) {
          updateQuantity(item.listingId, data.stockQuantity);
          nextWarnings.push(`“${item.title}” quantity reduced to ${data.stockQuantity}.`);
        }
      }
    } finally {
      setWarnings(nextWarnings);
      setVerifying(false);
    }
  }, [items, token, user?.country, removeItem, updateQuantity]);

  useEffect(() => {
    if (ready && items.length) void verifyAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verify when cart opens / membership changes
  }, [ready]);

  const displaySubtotal = cartSubtotal(items);

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
        <Pressable
          style={styles.iconBtn}
          onPress={() => {
            if (!items.length) return;
            Alert.alert("Clear cart", "Remove all items?", [
              { text: "Cancel", style: "cancel" },
              { text: "Clear", style: "destructive", onPress: () => clearCart() },
            ]);
          }}
        >
          <Feather name="trash-2" size={18} color="#F8FAFC" />
        </Pressable>
      </View>
      <Text style={styles.title}>Cart</Text>
      <Text style={styles.sub}>
        Browsing {country} · Client totals are estimates; server validates at checkout.
      </Text>

      {warnings.map((w) => (
        <Text key={w} style={styles.warn}>
          {w}
        </Text>
      ))}

      <StateView
        loading={!ready || verifying}
        empty={ready && !verifying && items.length === 0}
        emptyTitle="Your cart is empty"
        emptyDetail="Add physical products from listing details."
        onRetry={() => void verifyAvailability()}
      >
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.listingId)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const image = resolveMediaUrl(item.image);
            return (
              <View style={styles.row}>
                {image ? (
                  <Image source={{ uri: image }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Feather name="image" size={18} color="#64748B" />
                  </View>
                )}
                <View style={styles.meta}>
                  <Text style={styles.itemTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.price}>
                    {item.currency === "HTG" ? "G " : item.currency === "DOP" ? "RD$ " : "$ "}
                    {item.price.toLocaleString()}
                  </Text>
                  <View style={styles.qtyRow}>
                    <Pressable
                      style={styles.qtyBtn}
                      onPress={() => updateQuantity(item.listingId, (item.quantity || 1) - 1)}
                    >
                      <Feather name="minus" size={14} color="#F8FAFC" />
                    </Pressable>
                    <Text style={styles.qty}>{item.quantity || 1}</Text>
                    <Pressable
                      style={styles.qtyBtn}
                      onPress={() => {
                        const result = updateQuantity(item.listingId, (item.quantity || 1) + 1);
                        if (!result.ok && result.error) Alert.alert("Quantity", result.error);
                      }}
                    >
                      <Feather name="plus" size={14} color="#F8FAFC" />
                    </Pressable>
                    <Pressable onPress={() => removeItem(item.listingId)} style={{ marginLeft: 12 }}>
                      <Text style={styles.remove}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            <View style={styles.footer}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>$ {displaySubtotal.toFixed(2)}</Text>
              <Pressable
                style={styles.primary}
                onPress={() => {
                  if (!token) {
                    router.push("/auth/login");
                    return;
                  }
                  router.push({
                    pathname: "/checkout",
                    params: { mode: "cart" },
                  });
                }}
              >
                <Text style={styles.primaryText}>Checkout</Text>
              </Pressable>
              <Text style={styles.note}>
                Multi-item cart checkout uses Flexa Wallet. Dominican items may require single-item
                Stripe checkout. Digital goods stay blocked on Android.
              </Text>
            </View>
          }
        />
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
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 16, fontWeight: "800", color: "#F8FAFC" },
  title: {
    marginHorizontal: 16,
    marginTop: 4,
    fontSize: 22,
    fontWeight: "800",
    color: "#F97316",
  },
  sub: { marginHorizontal: 16, color: "#94A3B8", fontSize: 12, marginBottom: 8 },
  warn: { marginHorizontal: 16, color: "#FCD34D", fontSize: 12, marginBottom: 4 },
  list: { padding: 16, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
  },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: "#1E293B" },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  meta: { flex: 1, gap: 4 },
  itemTitle: { color: "#F8FAFC", fontWeight: "700", fontSize: 14 },
  price: { color: "#F97316", fontWeight: "700" },
  qtyRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  qty: { color: "#F8FAFC", marginHorizontal: 10, fontWeight: "700", minWidth: 16, textAlign: "center" },
  remove: { color: "#FCA5A5", fontWeight: "600", fontSize: 12 },
  footer: { marginTop: 12, gap: 6 },
  totalLabel: { color: "#94A3B8" },
  totalValue: { color: "#F8FAFC", fontSize: 22, fontWeight: "800" },
  primary: {
    marginTop: 8,
    backgroundColor: "#F97316",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  note: { color: "#64748B", fontSize: 12, lineHeight: 18, marginTop: 6 },
});
