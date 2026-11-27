import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  fetchRestaurant,
  formatMoney,
  placeRestaurantOrder,
  type Restaurant,
} from "@/lib/restaurantApi";
import {
  cartTotals,
  clearRestaurantCart,
  getRestaurantCart,
  setCartMeta,
  type RestaurantCartState,
} from "@/lib/restaurantCart";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

function newKey() {
  return `rest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function RestaurantCheckoutScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const idem = useRef(newKey());
  const [cart, setCart] = useState<RestaurantCartState | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const c = await getRestaurantCart();
      setCart(c);
      if (c) {
        try {
          setRestaurant(await fetchRestaurant(c.restaurantId, { token }));
        } catch {
          setRestaurant(null);
        }
      }
    })();
  }, [token]);

  const totals = cartTotals(cart, restaurant?.deliveryFee || 0);
  const canDelivery =
    (restaurant?.fulfillment === "delivery" || restaurant?.fulfillment === "both")
    && restaurant?.deliveryAvailable !== false
    && !restaurant?.deliverySuspended;
  const canPickup =
    restaurant?.fulfillment === "pickup"
    || restaurant?.fulfillment === "both"
    || !restaurant?.fulfillment
    || restaurant?.pickupAvailable !== false;

  async function updateFulfillment(f: "pickup" | "delivery") {
    const next = await setCartMeta({ fulfillment: f });
    setCart(next);
  }

  async function submit() {
    if (!user || !token) {
      setError(t("common_loginRequired") || "Sign in required");
      return;
    }
    if (!cart?.lines.length) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await placeRestaurantOrder(
        cart.restaurantId,
        {
          fulfillment: cart.fulfillment,
          items: cart.lines
            .filter((l) => l.mode === "order")
            .map((l) => ({
              dailyMenuItemId: l.dailyMenuItemId,
              quantity: l.quantity,
              notes: l.notes,
              optionIds: l.optionIds,
            })),
          specialInstructions: cart.specialInstructions,
          deliveryAddress: cart.fulfillment === "delivery" ? cart.deliveryAddress : undefined,
          idempotencyKey: idem.current,
        },
        { token },
      );
      await clearRestaurantCart();
      setCart(null);
      const payNote = result.payment?.clientSecret
        ? t("restaurant_completePayment") || "Complete payment to confirm (Stripe test mode)."
        : t("restaurant_orderPlaced") || "Order placed";
      setDone(`#${result.order.id} · ${payNote}`);
    } catch (e: any) {
      setError(e?.message || "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <RestaurantShell title={t("restaurant_checkout") || "Checkout"}>
        <Text style={styles.doneTitle}>{t("restaurant_orderPlaced") || "Request sent"}</Text>
        <Text style={styles.muted}>{done}</Text>
        <Text style={styles.note}>{t("restaurant_deliveryManagedByBusiness")}</Text>
        <Text style={styles.note}>
          {t("restaurant_paymentSheetNote")
            || "Native PaymentSheet requires @stripe/stripe-react-native. Order is pending_payment until Stripe confirms via webhook."}
        </Text>
        <Pressable style={styles.btn} onPress={() => router.replace("/restaurant/my-orders" as any)}>
          <Text style={styles.btnText}>{t("restaurant_myOrdersTitle")}</Text>
        </Pressable>
      </RestaurantShell>
    );
  }

  if (!cart?.lines.length) {
    return (
      <RestaurantShell title={t("restaurant_checkout") || "Checkout"}>
        <Text style={styles.muted}>{t("restaurant_cartEmpty") || "Cart empty"}</Text>
      </RestaurantShell>
    );
  }

  return (
    <RestaurantShell title={t("restaurant_placeOrderTitle") || "Place order"} subtitle={cart.restaurantName}>
      <Text style={styles.note}>{t("restaurant_deliveryManagedByBusiness")}</Text>
      <Text style={styles.note}>{t("restaurant_driverPolicyNote")}</Text>

      <View style={styles.row}>
        <Pressable
          disabled={!canPickup}
          style={[styles.ful, cart.fulfillment === "pickup" && styles.fulOn, !canPickup && styles.disabled]}
          onPress={() => void updateFulfillment("pickup")}
        >
          <Text style={[styles.fulText, cart.fulfillment === "pickup" && styles.fulTextOn]}>
            {t("restaurant_pickup") || "Pickup"}
          </Text>
        </Pressable>
        <Pressable
          disabled={!canDelivery}
          style={[styles.ful, cart.fulfillment === "delivery" && styles.fulOn, !canDelivery && styles.disabled]}
          onPress={() => void updateFulfillment("delivery")}
        >
          <Text style={[styles.fulText, cart.fulfillment === "delivery" && styles.fulTextOn]}>
            {t("restaurant_delivery") || "Delivery"}
          </Text>
        </Pressable>
      </View>

      {cart.fulfillment === "delivery" && (
        <TextInput
          value={cart.deliveryAddress}
          onChangeText={(v) => {
            void setCartMeta({ deliveryAddress: v }).then(setCart);
          }}
          placeholder={t("restaurant_deliveryAddress") || "Delivery address"}
          placeholderTextColor={T.muted}
          style={styles.input}
        />
      )}

      <TextInput
        value={cart.specialInstructions}
        onChangeText={(v) => {
          void setCartMeta({ specialInstructions: v }).then(setCart);
        }}
        placeholder={t("restaurant_orderNotesPlaceholder") || "Order notes"}
        placeholderTextColor={T.muted}
        style={[styles.input, { minHeight: 72 }]}
        multiline
      />

      <Text style={styles.total}>
        {t("restaurant_total") || "Total"}: {formatMoney(totals.total, totals.currency)}
      </Text>
      <Text style={styles.muted}>{t("restaurant_commissionZero") || "Flexa commission: $0.00"}</Text>

      {error ? <Text style={styles.err}>{error}</Text> : null}

      <Pressable
        style={[styles.btn, submitting && styles.disabled]}
        disabled={submitting || (cart.fulfillment === "delivery" && !cart.deliveryAddress.trim())}
        onPress={() => void submit()}
      >
        {submitting ? (
          <ActivityIndicator color={T.white} />
        ) : (
          <Text style={styles.btnText}>
            {t("restaurant_placeOrder") || "Place order"} — {formatMoney(totals.total, totals.currency)}
          </Text>
        )}
      </Pressable>
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, color: T.accent, marginBottom: 6, lineHeight: 17 },
  row: { flexDirection: "row", gap: 8, marginVertical: 10 },
  ful: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    backgroundColor: T.white,
    paddingVertical: 14,
    alignItems: "center",
  },
  fulOn: { backgroundColor: "rgba(26,107,71,0.12)", borderColor: T.accent },
  fulText: { fontWeight: "800", color: T.ink },
  fulTextOn: { color: T.accent },
  input: {
    backgroundColor: T.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    padding: 12,
    color: T.ink,
    marginBottom: 10,
  },
  total: { fontWeight: "900", fontSize: 16, color: T.ink, marginTop: 8 },
  muted: { color: T.muted, fontSize: 12, marginTop: 4 },
  btn: {
    marginTop: 16,
    backgroundColor: T.accent,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: T.white, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  err: { color: "#b91c1c", marginTop: 8 },
  doneTitle: { fontSize: 18, fontWeight: "900", color: T.ink, marginBottom: 8 },
});
