import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useLanguage } from "@/context/LanguageContext";
import { formatMoney } from "@/lib/restaurantApi";
import {
  cartTotals,
  clearRestaurantCart,
  getRestaurantCart,
  upsertCartLine,
  type RestaurantCartState,
} from "@/lib/restaurantCart";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

export default function RestaurantCartScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const [cart, setCart] = useState<RestaurantCartState | null>(null);

  const reload = useCallback(async () => {
    setCart(await getRestaurantCart());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const totals = cartTotals(cart);

  async function changeQty(lineIndex: number, delta: number) {
    if (!cart) return;
    const line = cart.lines[lineIndex];
    if (!line) return;
    const next = await upsertCartLine(
      { id: cart.restaurantId, name: cart.restaurantName },
      { ...line, quantity: line.quantity + delta },
    );
    setCart(next.lines.length ? next : null);
  }

  return (
    <RestaurantShell title={t("restaurant_cart") || "Cart"} subtitle={cart?.restaurantName}>
      {!cart || cart.lines.length === 0 ? (
        <>
          <Text style={styles.muted}>{t("restaurant_cartEmpty") || "Your restaurant cart is empty"}</Text>
          <Pressable style={styles.btn} onPress={() => router.push("/restaurant/discover" as any)}>
            <Text style={styles.btnText}>{t("restaurant_discoverTitle")}</Text>
          </Pressable>
        </>
      ) : (
        <>
          {cart.lines.map((line, idx) => (
            <View key={`${line.dailyMenuItemId}-${idx}`} style={styles.card}>
              <Text style={styles.title}>
                {line.name}
                {line.optionLabels?.length ? ` (${line.optionLabels.join(", ")})` : ""}
              </Text>
              <Text style={styles.muted}>
                {formatMoney(line.price, line.currency)} × {line.quantity}
              </Text>
              <View style={styles.row}>
                <Pressable style={styles.qty} onPress={() => void changeQty(idx, -1)}>
                  <Text style={styles.qtyText}>−</Text>
                </Pressable>
                <Text style={styles.qtyVal}>{line.quantity}</Text>
                <Pressable style={styles.qty} onPress={() => void changeQty(idx, 1)}>
                  <Text style={styles.qtyText}>+</Text>
                </Pressable>
              </View>
            </View>
          ))}
          <Text style={styles.total}>
            {t("restaurant_subtotal") || "Subtotal"}: {formatMoney(totals.subtotal, totals.currency)}
          </Text>
          <Pressable style={styles.btn} onPress={() => router.push("/restaurant/checkout" as any)}>
            <Text style={styles.btnText}>{t("restaurant_checkout") || "Checkout"}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void clearRestaurantCart().then(() => setCart(null));
            }}
            style={{ marginTop: 12 }}
          >
            <Text style={{ textAlign: "center", color: T.muted, fontWeight: "700" }}>
              {t("restaurant_clearCart") || "Clear"}
            </Text>
          </Pressable>
        </>
      )}
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontWeight: "800", color: T.ink },
  muted: { color: T.muted, fontSize: 13, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
  qty: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(26,107,71,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: { fontSize: 18, fontWeight: "800", color: T.accent },
  qtyVal: { fontWeight: "800", color: T.ink, minWidth: 20, textAlign: "center" },
  total: { fontWeight: "900", color: T.ink, marginVertical: 12, fontSize: 16 },
  btn: {
    backgroundColor: T.accent,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: T.white, fontWeight: "900" },
});
