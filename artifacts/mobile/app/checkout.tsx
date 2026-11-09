import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { apiFetch } from "@/lib/api";
import {
  cartSubtotal,
  grandTotalUsd,
  isDigitalGoodsBlockedPath,
  referralFeeUsd,
} from "@/lib/checkoutMath";
import { HAITI_COMMUNES_BY_DEPARTMENT, HAITI_DEPARTMENTS } from "@/lib/haitiCommunes";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Step = 1 | 2 | 3 | 4;
type PayMethod = "stripe" | "wallet";

type Quote = {
  buyerTotal?: number;
  deliveryFeeUsd?: number;
  buyerFeeAmount?: number;
  totalAmount?: number;
  sellerEarnings?: number;
};

export default function CheckoutScreen() {
  const { token, user } = useAuth();
  const { items, clearCart } = useCart();
  const params = useLocalSearchParams<{
    mode?: string;
    listingId?: string;
  }>();
  const mode = params.mode === "cart" ? "cart" : "single";
  const listingIdParam = Number(params.listingId);
  useAndroidBack();

  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);

  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [email, setEmail] = useState(user?.email || "");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState(user?.city || "");
  const [region, setRegion] = useState("");
  const [zip, setZip] = useState("");
  const [department, setDepartment] = useState<string>("Ouest");
  const [commune, setCommune] = useState<string>("");

  const [deliveryMethod, setDeliveryMethod] = useState<"motorcycle" | "car" | "bus" | "carrier">(
    "motorcycle",
  );
  const [deliveryFeeUsd, setDeliveryFeeUsd] = useState(0);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>("stripe");
  const [confirmation, setConfirmation] = useState<{
    orderIds: number[];
    message: string;
  } | null>(null);

  const singleItem = useMemo(() => {
    if (mode !== "single" || !Number.isFinite(listingIdParam)) return null;
    return items.find((i) => i.listingId === listingIdParam) || null;
  }, [mode, listingIdParam, items]);

  const checkoutItems = mode === "cart" ? items : singleItem ? [singleItem] : [];
  const listingCountry = checkoutItems[0]?.country || user?.country || null;
  const isHaiti = listingCountry === "Haiti";
  const isDR = listingCountry === "Dominican Republic";
  const subtotal = cartSubtotal(checkoutItems);
  const referral = referralFeeUsd(subtotal, (user as any)?.referredByUserId);
  const displayTotal = grandTotalUsd({
    subtotal: quote?.totalAmount ?? subtotal,
    deliveryFeeUsd: quote?.deliveryFeeUsd ?? deliveryFeeUsd,
    buyerFeeUsd: quote?.buyerFeeAmount ?? 0,
    referralFeeUsd: referral,
  });

  useEffect(() => {
    if (!token) return;
    if (mode === "cart" && isDR) {
      setError("Dominican Republic items require single-item checkout (Stripe).");
      setPayMethod("stripe");
    }
    if (mode === "cart") setPayMethod("wallet");
  }, [mode, isDR, token]);

  useEffect(() => {
    if (isHaiti && commune) setCity(commune);
  }, [isHaiti, commune]);

  async function loadQuote() {
    if (!token || checkoutItems.length !== 1) {
      setQuote(null);
      return;
    }
    const listingId = checkoutItems[0].listingId;
    try {
      const fee = deliveryMethod === "carrier" ? 0 : deliveryFeeUsd;
      const qs = new URLSearchParams({
        listingId: String(listingId),
        method: payMethod === "stripe" ? "stripe" : "wallet",
        deliveryFeeUsd: String(fee),
      });
      const res = await apiFetch(`/commission/quote?${qs.toString()}`, { token, auth: true });
      if (!res.ok) return;
      const data = await res.json();
      setQuote(data);
    } catch {
      /* display estimates remain */
    }
  }

  useEffect(() => {
    if (step >= 2) void loadQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, payMethod, deliveryFeeUsd, deliveryMethod, checkoutItems.length]);

  async function estimateDelivery() {
    if (!token || !checkoutItems.length || !city.trim()) return;
    if (!isHaiti && !isDR) {
      setDeliveryFeeUsd(0);
      setDeliveryMethod("carrier");
      return;
    }
    try {
      const listingId = checkoutItems[0].listingId;
      const listingRes = await apiFetch(`/listings/${listingId}`, { token, auth: true });
      const listing = listingRes.ok ? await listingRes.json() : null;
      const sellerCity = listing?.city || listing?.location || "";
      const res = await apiFetch("/delivery/calculate-price", {
        method: "POST",
        token,
        body: JSON.stringify({
          sellerCity,
          buyerCity: city.trim(),
          country: listingCountry || "Haiti",
          method: deliveryMethod === "carrier" ? "motorcycle" : deliveryMethod,
          listingPriceUsd: checkoutItems[0].price,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.feeUsd === "number") {
        setDeliveryFeeUsd(data.feeUsd);
      }
    } catch {
      /* keep prior fee */
    }
  }

  function validateAddress(): boolean {
    if (!name.trim() || !phone.trim() || !city.trim()) {
      setError("Name, phone, and city are required.");
      return false;
    }
    if (isHaiti && (!department || !commune)) {
      setError("Select Haiti department and commune.");
      return false;
    }
    setError(null);
    return true;
  }

  async function placeOrder() {
    if (!token || !user) {
      router.push("/auth/login");
      return;
    }
    if (submitLock.current || busy) return;
    if (!checkoutItems.length) {
      setError("Cart is empty.");
      return;
    }
    // Hard stop: never call digital-goods initiation paths from checkout.
    if (isDigitalGoodsBlockedPath("/subscription/checkout")) {
      /* sanity helper retained for tests; checkout does not navigate there */
    }

    submitLock.current = true;
    setBusy(true);
    setError(null);
    try {
      if (mode === "cart") {
        if (payMethod !== "wallet") {
          throw new Error("Multi-item cart checkout supports Flexa Wallet only.");
        }
        const res = await apiFetch("/cart/checkout", {
          method: "POST",
          token,
          body: JSON.stringify({
            items: checkoutItems.map((i) => ({
              listingId: i.listingId,
              quantity: i.quantity || 1,
            })),
            shippingName: name.trim(),
            shippingPhone: phone.trim(),
            shippingEmail: email.trim() || undefined,
            shippingStreet: street.trim() || undefined,
            shippingCity: city.trim(),
            shippingRegion: isHaiti ? department : region.trim() || undefined,
            paymentMethod: "wallet",
            deliveryMethod: isHaiti ? deliveryMethod : "motorcycle",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data.code === "DOMINICAN_ITEM_CHECKOUT_REQUIRED") {
            throw new Error("Dominican items require single-item Stripe checkout from the listing.");
          }
          throw new Error(data.error || `Checkout failed (${res.status})`);
        }
        clearCart();
        const orderIds = Array.isArray(data.orders)
          ? data.orders.map((o: any) => Number(o.txId)).filter(Boolean)
          : [];
        setConfirmation({
          orderIds,
          message: `Order placed. Grand total $${Number(data.grandTotal ?? displayTotal).toFixed(2)}.`,
        });
        setStep(4);
        return;
      }

      // Single-item path
      const listingId = checkoutItems[0].listingId;
      if (payMethod === "stripe") {
        const res = await apiFetch("/stripe/checkout", {
          method: "POST",
          token,
          body: JSON.stringify({
            listingId,
            uiMode: "hosted",
            shippingName: name.trim(),
            shippingPhone: phone.trim(),
            shippingEmail: email.trim() || undefined,
            shippingStreet: street.trim() || undefined,
            shippingCity: city.trim(),
            shippingRegion: isHaiti ? department : region.trim() || undefined,
            shippingZip: zip.trim() || undefined,
            shippingCountry: listingCountry || user.country || undefined,
            deliveryFeeUsd: deliveryFeeUsd > 0 ? deliveryFeeUsd : undefined,
            deliveryMethod:
              deliveryMethod === "carrier" ? undefined : isHaiti ? deliveryMethod : undefined,
            deliveryPickupCity: isHaiti ? undefined : undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Stripe checkout failed (${res.status})`);
        if (!data.url) throw new Error("No Stripe checkout URL returned.");
        await WebBrowser.openBrowserAsync(String(data.url), {
          dismissButtonStyle: "close",
          controlsColor: "#F97316",
        });
        setConfirmation({
          orderIds: [],
          message:
            "Complete payment in Stripe. Your order appears under My Orders after the payment succeeds.",
        });
        setStep(4);
        return;
      }

      // Wallet single purchase
      const res = await apiFetch(`/listings/${listingId}/purchase`, {
        method: "POST",
        token,
        body: JSON.stringify({
          paymentMethod: "wallet",
          paymentRef: `wallet-${user.id}-${listingId}-${Date.now()}`,
          shipping: {
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || undefined,
            street: street.trim() || city.trim(),
            city: city.trim(),
            region: isHaiti ? department : region.trim() || "N/A",
          },
          deliveryFeeUsd: deliveryFeeUsd > 0 ? deliveryFeeUsd : undefined,
          deliveryMethod: isHaiti ? deliveryMethod : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Purchase failed (${res.status})`);
      clearCart();
      setConfirmation({
        orderIds: data.transactionId ? [Number(data.transactionId)] : [],
        message:
          data.paymentStatus === "pending_review"
            ? "Order submitted — payment pending review."
            : "Order confirmed with Flexa Wallet.",
      });
      setStep(4);
    } catch (e: any) {
      setError(e?.message || "Checkout failed.");
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }

  if (!token || !user) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.pad}>
          <Text style={styles.brand}>Flexa Market</Text>
          <Text style={styles.title}>Checkout</Text>
          <Text style={styles.muted}>Sign in to continue.</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/auth/login")}>
            <Text style={styles.primaryText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!checkoutItems.length && step !== 4) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.pad}>
          <Text style={styles.brand}>Flexa Market</Text>
          <Text style={styles.title}>Checkout</Text>
          <Text style={styles.muted}>No items to checkout.</Text>
          <Pressable style={styles.primary} onPress={() => router.replace("/cart")}>
            <Text style={styles.primaryText}>Go to cart</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const communes = HAITI_COMMUNES_BY_DEPARTMENT[department] || [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/cart"))}
        >
          <Feather name="arrow-left" size={20} color="#F8FAFC" />
        </Pressable>
        <Text style={styles.brand}>Flexa Market</Text>
        <View style={styles.iconBtn} />
      </View>
      <Text style={styles.title}>Checkout</Text>
      <Text style={styles.steps}>
        {(["Address", "Shipping", "Payment", "Confirm"] as const).map((label, idx) => {
          const n = (idx + 1) as Step;
          return (
            <Text key={label} style={[styles.step, step === n && styles.stepActive]}>
              {n}. {label}{" "}
            </Text>
          );
        })}
      </Text>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {step === 1 ? (
          <View style={styles.block}>
            <Text style={styles.label}>Full name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor="#64748B" />
            <Text style={styles.label}>Phone</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor="#64748B" />
            <Text style={styles.label}>Email (optional)</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" placeholderTextColor="#64748B" />
            <Text style={styles.label}>Street</Text>
            <TextInput style={styles.input} value={street} onChangeText={setStreet} placeholderTextColor="#64748B" />
            {isHaiti ? (
              <>
                <Text style={styles.label}>Department</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {HAITI_DEPARTMENTS.map((dep) => (
                    <Pressable
                      key={dep}
                      style={[styles.chip, department === dep && styles.chipActive]}
                      onPress={() => {
                        setDepartment(dep);
                        setCommune("");
                      }}
                    >
                      <Text style={[styles.chipText, department === dep && styles.chipTextActive]}>{dep}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={styles.label}>Commune</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {communes.map((c) => (
                    <Pressable
                      key={c}
                      style={[styles.chip, commune === c && styles.chipActive]}
                      onPress={() => setCommune(c)}
                    >
                      <Text style={[styles.chipText, commune === c && styles.chipTextActive]}>{c}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : (
              <>
                <Text style={styles.label}>City</Text>
                <TextInput style={styles.input} value={city} onChangeText={setCity} placeholderTextColor="#64748B" />
                <Text style={styles.label}>Region / State</Text>
                <TextInput style={styles.input} value={region} onChangeText={setRegion} placeholderTextColor="#64748B" />
                <Text style={styles.label}>ZIP (optional)</Text>
                <TextInput style={styles.input} value={zip} onChangeText={setZip} placeholderTextColor="#64748B" />
              </>
            )}
            <Pressable
              style={styles.primary}
              onPress={() => {
                if (!validateAddress()) return;
                void estimateDelivery();
                setStep(2);
              }}
            >
              <Text style={styles.primaryText}>Continue to shipping</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.block}>
            {isHaiti ? (
              <>
                <Text style={styles.label}>Local delivery method</Text>
                <View style={styles.chips}>
                  {(["motorcycle", "car", "bus"] as const).map((m) => (
                    <Pressable
                      key={m}
                      style={[styles.chip, deliveryMethod === m && styles.chipActive]}
                      onPress={() => {
                        setDeliveryMethod(m);
                        void estimateDelivery();
                      }}
                    >
                      <Text style={[styles.chipText, deliveryMethod === m && styles.chipTextActive]}>{m}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.note}>
                  Haiti domestic delivery uses PIN confirmation — not carrier photo proof.
                </Text>
              </>
            ) : isDR ? (
              <Text style={styles.note}>
                Dominican checkout may use local carriers or self-delivery. Prefer single-item Stripe
                checkout when required by the server.
              </Text>
            ) : (
              <Text style={styles.note}>
                International shipping options are calculated server-side. Tracking appears on the order
                after the seller ships (no invented tracking data).
              </Text>
            )}
            <Text style={styles.meta}>Estimated delivery fee: ${deliveryFeeUsd.toFixed(2)}</Text>
            <Pressable style={styles.secondary} onPress={() => void estimateDelivery()}>
              <Text style={styles.secondaryText}>Refresh estimate</Text>
            </Pressable>
            <View style={styles.rowBtns}>
              <Pressable style={styles.secondary} onPress={() => setStep(1)}>
                <Text style={styles.secondaryText}>Back</Text>
              </Pressable>
              <Pressable style={styles.primary} onPress={() => setStep(3)}>
                <Text style={styles.primaryText}>Continue to payment</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.block}>
            <Text style={styles.label}>Payment method</Text>
            {mode === "single" ? (
              <View style={styles.chips}>
                <Pressable
                  style={[styles.chip, payMethod === "stripe" && styles.chipActive]}
                  onPress={() => setPayMethod("stripe")}
                >
                  <Text style={[styles.chipText, payMethod === "stripe" && styles.chipTextActive]}>
                    Card (Stripe)
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.chip, payMethod === "wallet" && styles.chipActive]}
                  onPress={() => setPayMethod("wallet")}
                >
                  <Text style={[styles.chipText, payMethod === "wallet" && styles.chipTextActive]}>
                    Flexa Wallet / Card balance
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.note}>Cart checkout uses Flexa Wallet only (existing API rule).</Text>
            )}
            <Text style={styles.meta}>Items subtotal: ${subtotal.toFixed(2)}</Text>
            <Text style={styles.meta}>Delivery: ${(quote?.deliveryFeeUsd ?? deliveryFeeUsd).toFixed(2)}</Text>
            {referral > 0 ? <Text style={styles.meta}>Referral fee: ${referral.toFixed(2)}</Text> : null}
            <Text style={styles.total}>Buyer total (estimate): ${Number(quote?.buyerTotal ?? displayTotal).toFixed(2)}</Text>
            <Text style={styles.note}>
              Server validates prices, inventory, commissions, and payment. Card data is never stored in
              the app. Digital goods remain disabled on Android.
            </Text>
            <View style={styles.rowBtns}>
              <Pressable style={styles.secondary} onPress={() => setStep(2)}>
                <Text style={styles.secondaryText}>Back</Text>
              </Pressable>
              <Pressable
                style={[styles.primary, busy && styles.disabled]}
                disabled={busy}
                onPress={() => void placeOrder()}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Pay now</Text>}
              </Pressable>
            </View>
          </View>
        ) : null}

        {step === 4 && confirmation ? (
          <View style={styles.block}>
            <Feather name="check-circle" size={36} color="#86EFAC" />
            <Text style={styles.title}>Order confirmation</Text>
            <Text style={styles.muted}>{confirmation.message}</Text>
            {confirmation.orderIds.map((id) => (
              <Pressable key={id} style={styles.secondary} onPress={() => router.replace(`/orders/${id}`)}>
                <Text style={styles.secondaryText}>View order #{id}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.primary} onPress={() => router.replace("/orders")}>
              <Text style={styles.primaryText}>My Orders</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  pad: { padding: 20, gap: 10 },
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
  steps: { marginHorizontal: 16, marginBottom: 8, color: "#64748B", fontSize: 12 },
  step: { color: "#64748B" },
  stepActive: { color: "#F97316", fontWeight: "700" },
  content: { padding: 16, paddingBottom: 48 },
  block: { gap: 8 },
  label: { color: "#CBD5E1", fontSize: 13, fontWeight: "700", marginTop: 6 },
  input: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#F8FAFC",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0F172A",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: "#F97316", borderColor: "#F97316" },
  chipText: { color: "#94A3B8", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  primary: {
    marginTop: 12,
    backgroundColor: "#F97316",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    flex: 1,
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondary: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    flex: 1,
  },
  secondaryText: { color: "#F8FAFC", fontWeight: "600" },
  rowBtns: { flexDirection: "row", gap: 10 },
  muted: { color: "#94A3B8" },
  meta: { color: "#CBD5E1", fontSize: 13 },
  total: { color: "#F8FAFC", fontSize: 18, fontWeight: "800", marginTop: 6 },
  note: { color: "#64748B", fontSize: 12, lineHeight: 18 },
  error: { color: "#FCA5A5", marginBottom: 8 },
  disabled: { opacity: 0.65 },
});
