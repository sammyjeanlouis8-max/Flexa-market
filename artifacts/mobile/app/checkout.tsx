/**
 * Native multi-step checkout:
 * 1) Shipping address  2) Shipping method  3) Payment (wallet / Card FM)  4) Place order
 * Uses POST /api/cart/checkout — same wallet-only rules as the website.
 */
import { Feather } from "@expo/vector-icons";
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
  cartCheckout,
  cartHasDominicanItems,
  fetchUserAddresses,
  fetchWalletBalance,
  persistCheckoutAddress,
  type CheckoutOrder,
} from "@/lib/checkoutApi";

type Step = "address" | "shipping" | "payment" | "review";

const STEPS: Step[] = ["address", "shipping", "payment", "review"];

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const { token, user } = useAuth();
  const { country } = useMarketplace();
  const { items, removeItem, clearCart } = useCart();

  const selectedIds = useMemo(() => {
    if (!ids) return new Set(items.map((i) => i.listingId));
    return new Set(
      String(ids)
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => n > 0),
    );
  }, [ids, items]);

  const checkoutItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.listingId)),
    [items, selectedIds],
  );

  const [step, setStep] = useState<Step>("address");
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [city, setCity] = useState(user?.city ?? user?.location ?? "");
  const [street, setStreet] = useState("");
  const [region, setRegion] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<"motorcycle" | "car">(
    "motorcycle",
  );
  const [deliveryTotal, setDeliveryTotal] = useState(0);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [walletAvailable, setWalletAvailable] = useState<number | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
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
  const referralFee =
    (user as { referredByUserId?: number } | null)?.referredByUserId &&
    subtotal > 14.99
      ? 0.5
      : 0;
  const estimatedTotal =
    Math.round((subtotal + deliveryTotal + referralFee) * 100) / 100;

  const hasDominican = cartHasDominicanItems(checkoutItems);
  const stepIndex = STEPS.indexOf(step);

  // Prefill from saved addresses
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
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Wallet balance for payment step
  useEffect(() => {
    if (!token || (step !== "payment" && step !== "review")) return;
    let cancelled = false;
    setWalletLoading(true);
    fetchWalletBalance({ token })
      .then((w) => {
        if (!cancelled) setWalletAvailable(w.availableUsd);
      })
      .catch(() => {
        if (!cancelled) setWalletAvailable(null);
      })
      .finally(() => {
        if (!cancelled) setWalletLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, step]);

  const quoteDelivery = useCallback(async () => {
    if (!token || !city.trim() || checkoutItems.length === 0) {
      setDeliveryTotal(0);
      return;
    }
    setDeliveryLoading(true);
    try {
      // One quote per seller group (first item’s city as pickup), same UX as website.
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
          /* preview optional — server recalculates on submit */
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

  useEffect(() => {
    if (!token) {
      router.replace("/auth/login");
    }
  }, [token, router]);

  useEffect(() => {
    if (checkoutItems.length === 0) {
      router.replace("/cart");
    }
  }, [checkoutItems.length, router]);

  const validateAddress = () => {
    if (!name.trim() || !phone.trim() || !city.trim()) {
      setError("Full name, phone, and city are required.");
      return false;
    }
    setError("");
    return true;
  };

  const goNext = () => {
    if (step === "address" && !validateAddress()) return;
    if (hasDominican) {
      setError(
        "Dominican Republic items require individual listing checkout.",
      );
      return;
    }
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

  const placeOrder = async () => {
    if (submitLock.current || submitting || !token) return;
    if (!validateAddress()) {
      setStep("address");
      return;
    }
    if (hasDominican) {
      setError(
        "Dominican Republic items require individual listing checkout.",
      );
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setError("");
    try {
      const result = await cartCheckout(
        {
          items: checkoutItems.map((i) => ({
            listingId: i.listingId,
            quantity: i.quantity,
          })),
          shippingName: name.trim(),
          shippingPhone: phone.trim(),
          shippingStreet: street.trim() || null,
          shippingCity: city.trim(),
          shippingRegion: region.trim() || null,
          paymentMethod: "wallet",
          deliveryMethod,
        },
        { token },
      );
      if (!result.ok) {
        if (result.code === "DOMINICAN_ITEM_CHECKOUT_REQUIRED") {
          setError(
            result.error ||
              "Dominican listings must be purchased on the product page.",
          );
        } else {
          setError(result.error || "Checkout failed. Try again.");
        }
        return;
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
      // Remove purchased lines (or clear if all selected)
      const purchased = new Set(checkoutItems.map((i) => i.listingId));
      if (purchased.size >= items.length) clearCart();
      else for (const id of purchased) removeItem(id);

      const orders: CheckoutOrder[] = result.orders ?? [];
      router.replace({
        pathname: "/checkout-success",
        params: {
          orders: JSON.stringify(orders),
          deliveryTotal: String(result.deliveryTotal ?? deliveryTotal),
        },
      });
    } catch {
      setError("Network error. Check your connection and try again.");
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
          : "Review & confirm";

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
                ["City *", city, setCity, "default"],
                ["Street (optional)", street, setStreet, "default"],
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
                  keyboardType={keyboard === "phone-pad" ? "phone-pad" : "default"}
                  autoCapitalize={keyboard === "phone-pad" ? "none" : "words"}
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
            <Text style={styles.hint}>
              Final shipping is calculated securely on the server at payment.
            </Text>
          </View>
        ) : null}

        {step === "payment" ? (
          <View style={styles.block}>
            <Text style={styles.sectionLabel}>Payment</Text>
            <View style={[styles.methodRow, styles.methodRowOn]}>
              <Feather name="credit-card" size={20} color="#F97316" />
              <View style={{ flex: 1 }}>
                <Text style={styles.methodTitle}>Flexa Wallet (Card FM)</Text>
                <Text style={styles.methodSub}>
                  Cart checkout uses wallet balance only — same as the website.
                </Text>
              </View>
              <Feather name="check-circle" size={20} color="#F97316" />
            </View>
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Available balance</Text>
              {walletLoading ? (
                <ActivityIndicator color="#F97316" size="small" />
              ) : (
                <Text style={styles.feeValue}>
                  {walletAvailable == null
                    ? "—"
                    : `$${walletAvailable.toFixed(2)}`}
                </Text>
              )}
            </View>
            <Text style={styles.hint}>
              Stripe card checkout is available for single-item purchases and
              wallet top-ups — not multi-item cart checkout.
            </Text>
            {walletAvailable != null && walletAvailable < estimatedTotal ? (
              <Text style={styles.warn}>
                Balance may be insufficient for the estimated total ($
                {estimatedTotal.toFixed(2)}). Top up your wallet if checkout
                fails.
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
            <Text style={styles.reviewLine}>Pay with Flexa Wallet</Text>
            <View style={styles.totals}>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Products</Text>
                <Text style={styles.feeValue}>${subtotal.toFixed(2)}</Text>
              </View>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Shipping (est.)</Text>
                <Text style={styles.feeValue}>${deliveryTotal.toFixed(2)}</Text>
              </View>
              {referralFee > 0 ? (
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>Referral fee</Text>
                  <Text style={styles.feeValue}>${referralFee.toFixed(2)}</Text>
                </View>
              ) : null}
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
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            onPress={placeOrder}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                Place order · ${estimatedTotal.toFixed(2)}
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
    borderColor: "#FDBA74",
    backgroundColor: "#FFF7ED",
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
  totalValue: { color: "#F97316", fontSize: 18, fontWeight: "900" },
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
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
});
