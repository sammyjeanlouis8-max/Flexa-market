/**
 * Native multi-step checkout for physical goods:
 * 1) Shipping address  2) Shipping method  3) Payment (Stripe only)  4) Pay with Stripe
 *
 * Never calls POST /cart/checkout (wallet). Never debits FM Wallet / Card FM / MonCash.
 * Creates POST /stripe/checkout sessions and opens Stripe’s hosted payment UI in the
 * system browser (expo-web-browser) — not a Flexa Market WebView shell.
 */
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import {
  calculateDeliveryPrice,
  fetchUserAddresses,
  persistCheckoutAddress,
} from "@/lib/checkoutApi";
import { createStripeCheckoutSession } from "@/lib/stripeCheckoutApi";

type Step = "address" | "shipping" | "payment" | "review";

const STEPS: Step[] = ["address", "shipping", "payment", "review"];

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { ids, step: stepParam, uiPreview } = useLocalSearchParams<{
    ids?: string;
    step?: string;
    uiPreview?: string;
  }>();
  /** Dev-only visual preview of checkout steps (screenshots) — no Stripe submit. */
  const isUiPreview = __DEV__ && uiPreview === "1";
  const { token, user, isLoading: authLoading } = useAuth();
  const { country } = useMarketplace();
  const { items, removeItem, clearCart, ready: cartReady } = useCart();

  const selectedIds = useMemo(() => {
    if (!ids) return new Set(items.map((i) => i.listingId));
    return new Set(
      String(ids)
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => n > 0),
    );
  }, [ids, items]);

  const checkoutItems = useMemo(() => {
    const real = items.filter((i) => selectedIds.has(i.listingId));
    if (real.length > 0) return real;
    if (!isUiPreview) return real;
    return [
      {
        listingId: 73,
        title: "Ventilateur Oscillant Rechargeable 5400mAh USB-C",
        price: 4,
        currency: "USD",
        image: null,
        country: "Haiti",
        city: "Port-au-Prince",
        sellerId: 2,
        quantity: 1,
      },
    ];
  }, [items, selectedIds, isUiPreview]);

  const initialStep: Step =
    stepParam === "shipping" ||
    stepParam === "payment" ||
    stepParam === "review" ||
    stepParam === "address"
      ? stepParam
      : "address";
  const [step, setStep] = useState<Step>(initialStep);
  const [name, setName] = useState(user?.name ?? (isUiPreview ? "Test Buyer" : ""));
  const [phone, setPhone] = useState(
    user?.phone ?? (isUiPreview ? "5095551234" : ""),
  );
  const [email, setEmail] = useState(
    user?.email ?? (isUiPreview ? "buyer@example.com" : ""),
  );
  const [city, setCity] = useState(
    user?.city ?? user?.location ?? (isUiPreview ? "Port-au-Prince" : ""),
  );
  const [street, setStreet] = useState(isUiPreview ? "Delmas 33" : "");
  const [region, setRegion] = useState(isUiPreview ? "Ouest" : "");
  const [deliveryMethod, setDeliveryMethod] = useState<"motorcycle" | "car">(
    "motorcycle",
  );
  const [deliveryTotal, setDeliveryTotal] = useState(0);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);

  const subtotal = useMemo(
    () =>
      Math.round(
        checkoutItems.reduce((s, i) => s + i.price * i.quantity, 0) * 100,
      ) / 100,
    [checkoutItems],
  );
  const estimatedTotal =
    Math.round((subtotal + deliveryTotal) * 100) / 100;

  const stepIndex = STEPS.indexOf(step);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const { defaultAddress } = await fetchUserAddresses({ token });
      if (cancelled || !defaultAddress) return;
      setName((v) => v || defaultAddress.fullName);
      setPhone((v) => v || defaultAddress.phone);
      setCity((v) => v || defaultAddress.city);
      setStreet((v) => v || defaultAddress.street || "");
      setRegion((v) => v || defaultAddress.region || "");
      if (defaultAddress.email) setEmail((v) => v || defaultAddress.email || "");
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const quoteDelivery = useCallback(async () => {
    if (!token || !city.trim() || checkoutItems.length === 0) {
      setDeliveryTotal(0);
      return;
    }
    setDeliveryLoading(true);
    try {
      const bySeller = new Map<number, typeof checkoutItems>();
      for (const item of checkoutItems) {
        const g = bySeller.get(item.sellerId) ?? [];
        g.push(item);
        bySeller.set(item.sellerId, g);
      }
      let total = 0;
      for (const group of bySeller.values()) {
        const head = group[0];
        const sellerCity = head.city?.trim() || "Port-au-Prince";
        const listingCountry = head.country || country || "Haiti";
        try {
          const quote = await calculateDeliveryPrice(
            {
              sellerCity,
              buyerCity: city.trim(),
              country: listingCountry,
              method: deliveryMethod,
              listingPriceUsd: head.price,
            },
            { token },
          );
          total += quote.feeUsd;
        } catch {
          /* preview optional — server recalculates on Stripe session */
        }
      }
      setDeliveryTotal(Math.round(total * 100) / 100);
    } finally {
      setDeliveryLoading(false);
    }
  }, [token, city, checkoutItems, country, deliveryMethod]);

  useEffect(() => {
    if (step === "shipping" || step === "review" || step === "payment") {
      void quoteDelivery();
    }
  }, [step, quoteDelivery]);

  if (!isUiPreview && (authLoading || !cartReady)) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, justifyContent: "center" }]}>
        <ActivityIndicator color="#F97316" />
      </View>
    );
  }
  if (!isUiPreview && !token) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24, paddingHorizontal: 20 }]}>
        <Text style={styles.topTitle}>Checkout</Text>
        <Text style={{ color: "#64748B", marginTop: 8, marginBottom: 16 }}>
          Sign in to continue with Stripe checkout.
        </Text>
        <Pressable
          style={styles.payCta}
          onPress={() => router.push("/auth/login")}
        >
          <Text style={styles.payCtaText}>Sign in</Text>
        </Pressable>
        <Pressable
          style={[styles.backLink, { marginTop: 10 }]}
          onPress={() => router.push("/cart")}
        >
          <Text style={styles.backLinkText}>Back to cart</Text>
        </Pressable>
      </View>
    );
  }
  if (!isUiPreview && checkoutItems.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24, paddingHorizontal: 20 }]}>
        <Text style={styles.topTitle}>Checkout</Text>
        <Text style={{ color: "#64748B", marginTop: 8, marginBottom: 16 }}>
          Your cart is empty.
        </Text>
        <Pressable style={styles.payCta} onPress={() => router.push("/")}>
          <Text style={styles.payCtaText}>Continue shopping</Text>
        </Pressable>
      </View>
    );
  }

  const validateAddress = () => {
    if (!name.trim() || !phone.trim() || !city.trim() || !street.trim()) {
      setError("Full name, phone, street, and city are required.");
      return false;
    }
    setError("");
    return true;
  };

  const goNext = () => {
    if (step === "address" && !validateAddress()) return;
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  };

  const goBack = () => {
    setError("");
    if (stepIndex === 0) {
      router.back();
      return;
    }
    setStep(STEPS[stepIndex - 1]);
  };

  /**
   * Stripe-only physical checkout. Multi-item carts pay the first selected listing
   * via Stripe; remaining lines stay in the cart for a subsequent Stripe payment.
   * Never posts paymentMethod wallet / never hits /cart/checkout.
   */
  const payWithStripe = async () => {
    if (submitLock.current || submitting || !token) return;
    if (!validateAddress()) {
      setStep("address");
      return;
    }
    const head = checkoutItems[0];
    if (!head) {
      setError("Your cart is empty.");
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setError("");
    try {
      let itemDeliveryFee = 0;
      try {
        const sellerCity = head.city?.trim() || "Port-au-Prince";
        const quote = await calculateDeliveryPrice(
          {
            sellerCity,
            buyerCity: city.trim(),
            country: head.country || country || "Haiti",
            method: deliveryMethod,
            listingPriceUsd: head.price,
          },
          { token },
        );
        itemDeliveryFee = quote.feeUsd;
      } catch {
        itemDeliveryFee = checkoutItems.length === 1 ? deliveryTotal : 0;
      }

      const session = await createStripeCheckoutSession(
        {
          listingId: head.listingId,
          shippingName: name.trim(),
          shippingPhone: phone.trim(),
          shippingEmail: email.trim() || undefined,
          shippingStreet: street.trim(),
          shippingCity: city.trim(),
          shippingRegion: region.trim() || undefined,
          shippingCountry: head.country || user?.country || country || undefined,
          deliveryFeeUsd: itemDeliveryFee > 0 ? itemDeliveryFee : undefined,
          deliveryMethod,
          deliveryPickupCity: head.city?.trim() || undefined,
        },
        { token },
      );
      if (!session.url) {
        throw new Error("Stripe did not return a checkout URL");
      }

      void persistCheckoutAddress(
        { token },
        {
          fullName: name.trim(),
          phone: phone.trim(),
          street: street.trim(),
          city: city.trim(),
          region: region.trim() || "N/A",
          country: user?.country || country || "Haiti",
        },
      );

      // Remove this line before opening Stripe so a retry cannot wallet-debit it.
      if (checkoutItems.length >= items.length && checkoutItems.length === 1) {
        clearCart();
      } else {
        removeItem(head.listingId);
      }

      const result = await WebBrowser.openBrowserAsync(session.url, {
        enableBarCollapsing: true,
        showInRecents: true,
      });

      router.replace({
        pathname: "/checkout-success",
        params: {
          payment: "stripe",
          listingTitle: head.title,
          amount: String(head.price),
          deliveryTotal: String(itemDeliveryFee),
          remaining: String(Math.max(0, checkoutItems.length - 1)),
          browserResult: result.type,
        },
      });
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "PAYMENT_METHOD_UNAVAILABLE") {
        setError(err.message || "Card checkout is not available for this market.");
      } else if (err.code === "ANDROID_DIGITAL_PURCHASE_UNAVAILABLE") {
        setError(err.message || "This purchase is not available in the Android app.");
      } else {
        setError(err.message || "Could not start Stripe checkout. Try again.");
      }
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  };

  const stepLabel =
    step === "address"
      ? "Shipping address"
      : step === "shipping"
        ? "Shipping method"
        : step === "payment"
          ? "Payment"
          : "Review & pay";

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={goBack}>
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>Checkout</Text>
          <Text style={styles.topSub}>
            Step {stepIndex + 1} of {STEPS.length} · {stepLabel}
          </Text>
        </View>
      </View>

      <View style={styles.progress}>
        {STEPS.map((s, i) => (
          <View
            key={s}
            style={[
              styles.progressDot,
              i <= stepIndex && styles.progressDotOn,
            ]}
          />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 120,
          gap: 14,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.summaryCard}>
          <Text style={styles.sectionLabel}>Order</Text>
          <Text style={styles.summaryLine}>
            {checkoutItems.length} item(s) · ${subtotal.toFixed(2)}
          </Text>
          {checkoutItems.slice(0, 4).map((i) => (
            <Text key={i.listingId} style={styles.itemLine} numberOfLines={1}>
              {i.quantity}× {i.title}
            </Text>
          ))}
          {checkoutItems.length > 4 ? (
            <Text style={styles.itemLine}>
              +{checkoutItems.length - 4} more
            </Text>
          ) : null}
        </View>

        {step === "address" ? (
          <View style={styles.block}>
            <Text style={styles.sectionLabel}>Shipping address</Text>
            {(
              [
                ["Full name *", name, setName, "name"],
                ["Phone *", phone, setPhone, "phone-pad"],
                ["Email", email, setEmail, "email"],
                ["Street *", street, setStreet, "default"],
                ["City *", city, setCity, "default"],
                ["Region (optional)", region, setRegion, "default"],
              ] as const
            ).map(([label, value, setter, keyboard]) => (
              <View key={label} style={styles.field}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <TextInput
                  value={value}
                  onChangeText={setter}
                  placeholder={label.replace(" *", "")}
                  placeholderTextColor="#94A3B8"
                  keyboardType={
                    keyboard === "phone-pad"
                      ? "phone-pad"
                      : keyboard === "email"
                        ? "email-address"
                        : "default"
                  }
                  autoCapitalize={
                    keyboard === "phone-pad" || keyboard === "email"
                      ? "none"
                      : "words"
                  }
                  style={styles.input}
                />
              </View>
            ))}
          </View>
        ) : null}

        {step === "shipping" ? (
          <View style={styles.block}>
            <Text style={styles.sectionLabel}>Shipping method</Text>
            <Text style={styles.hint}>
              Delivery to {city.trim() || "your city"} · {country}
            </Text>
            {(
              [
                ["motorcycle", "Motorcycle", "Fast local delivery"],
                ["car", "Car", "Larger packages"],
              ] as const
            ).map(([id, title, sub]) => (
              <Pressable
                key={id}
                style={[
                  styles.methodRow,
                  deliveryMethod === id && styles.methodRowOn,
                ]}
                onPress={() => setDeliveryMethod(id)}
              >
                <Feather
                  name={id === "motorcycle" ? "truck" : "box"}
                  size={20}
                  color={deliveryMethod === id ? "#F97316" : "#64748B"}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.methodTitle}>{title}</Text>
                  <Text style={styles.methodSub}>{sub}</Text>
                </View>
                <Feather
                  name={deliveryMethod === id ? "check-circle" : "circle"}
                  size={20}
                  color={deliveryMethod === id ? "#F97316" : "#CBD5E1"}
                />
              </Pressable>
            ))}
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Estimated shipping</Text>
              {deliveryLoading ? (
                <ActivityIndicator color="#F97316" size="small" />
              ) : (
                <Text style={styles.feeValue}>${deliveryTotal.toFixed(2)}</Text>
              )}
            </View>
          </View>
        ) : null}

        {step === "payment" ? (
          <View style={styles.block} testID="checkout-payment-stripe-only">
            <Text style={styles.sectionLabel}>Payment</Text>
            <View style={[styles.methodRow, styles.methodRowOn]}>
              <Feather name="credit-card" size={20} color="#635BFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.methodTitle}>Stripe</Text>
                <Text style={styles.methodSub}>
                  Pay securely by card. The only payment method in this app for
                  physical goods.
                </Text>
              </View>
              <Feather name="check-circle" size={20} color="#635BFF" />
            </View>
            <Text style={styles.hint}>
              FM Wallet, Flexa Card, MonCash, and other balances are not available
              for checkout in the Android app. No wallet funds will be debited.
            </Text>
            {checkoutItems.length > 1 ? (
              <Text style={styles.warn}>
                Multi-item carts pay one listing at a time with Stripe. Remaining
                items stay in your cart after this payment.
              </Text>
            ) : null}
          </View>
        ) : null}

        {step === "review" ? (
          <View style={styles.block}>
            <Text style={styles.sectionLabel}>Review</Text>
            <Text style={styles.reviewLine}>
              {name} · {phone}
            </Text>
            <Text style={styles.reviewLine}>
              {[street, city, region].filter(Boolean).join(", ")}
            </Text>
            <Text style={styles.reviewLine}>
              {deliveryMethod === "motorcycle" ? "Motorcycle" : "Car"} delivery
            </Text>
            <Text style={styles.reviewLine}>Pay with Stripe</Text>
            <View style={styles.totals}>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Products</Text>
                <Text style={styles.feeValue}>${subtotal.toFixed(2)}</Text>
              </View>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Shipping (est.)</Text>
                <Text style={styles.feeValue}>${deliveryTotal.toFixed(2)}</Text>
              </View>
              <View style={styles.feeRow}>
                <Text style={styles.totalLabel}>Estimated total</Text>
                <Text style={styles.totalValue}>
                  ${estimatedTotal.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        {step !== "review" ? (
          <Pressable style={styles.primaryBtn} onPress={goNext}>
            <Text style={styles.primaryBtnText}>Continue</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.primaryBtn,
              styles.stripeBtn,
              submitting && styles.primaryBtnDisabled,
            ]}
            onPress={() => void payWithStripe()}
            disabled={submitting}
            testID="checkout-pay-stripe"
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                Pay with Stripe · ${estimatedTotal.toFixed(2)}
              </Text>
            )}
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  topSub: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  progress: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  progressDotOn: { backgroundColor: "#F97316" },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 4,
  },
  block: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  summaryLine: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  itemLine: { fontSize: 13, color: "#64748B" },
  field: { gap: 4 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: "#475569" },
  input: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#0F172A",
  },
  hint: { fontSize: 12, color: "#64748B", lineHeight: 17 },
  methodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  methodRowOn: {
    borderColor: "#A5B4FC",
    backgroundColor: "#EEF2FF",
  },
  methodTitle: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  methodSub: { fontSize: 12, color: "#64748B", marginTop: 2 },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  feeLabel: { color: "#64748B", fontSize: 13, fontWeight: "600" },
  feeValue: { color: "#0F172A", fontSize: 14, fontWeight: "800" },
  totalLabel: { color: "#0F172A", fontSize: 15, fontWeight: "900" },
  totalValue: { color: "#635BFF", fontSize: 18, fontWeight: "900" },
  totals: { gap: 8, marginTop: 4 },
  reviewLine: { fontSize: 14, color: "#334155", fontWeight: "600" },
  warn: {
    color: "#C2410C",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  error: {
    color: "#B91C1C",
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 12,
    fontWeight: "700",
    overflow: "hidden",
  },
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
  },
  primaryBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  stripeBtn: { backgroundColor: "#635BFF" },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  payCta: {
    height: 50,
    borderRadius: 999,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  payCtaText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  backLink: {
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  backLinkText: { color: "#0F172A", fontWeight: "800", fontSize: 14 },
});
