/**
 * Native Stripe single-item checkout (physical goods).
 * Creates hosted Checkout Session via POST /api/stripe/checkout, then opens
 * session.url in the system browser (expo-web-browser) — not an in-app marketplace shell.
 * Required for Dominican Republic listings (wallet cart blocked).
 */
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { listAddresses, type UserAddress } from "@/lib/addressesApi";
import { calculateDeliveryPrice, isDominicanListingCountry } from "@/lib/checkoutApi";
import { fetchListing, type Listing } from "@/lib/api";
import { createStripeCheckoutSession } from "@/lib/stripeCheckoutApi";

export default function StripeCheckoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { listingId: listingIdParam, canceled } = useLocalSearchParams<{
    listingId?: string;
    canceled?: string;
  }>();
  const listingId = Number(listingIdParam);
  const { token, user, isLoading: authLoading } = useAuth();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState(user?.city ?? user?.location ?? "");
  const [region, setRegion] = useState("");
  const [zip, setZip] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<"motorcycle" | "car" | "pickup">(
    "motorcycle",
  );
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addresses, setAddresses] = useState<UserAddress[]>([]);

  useEffect(() => {
    if (!authLoading && !token) router.replace("/auth/login");
  }, [authLoading, token, router]);

  useEffect(() => {
    if (canceled === "1") {
      Alert.alert("Checkout canceled", "Stripe checkout was canceled. You can try again.");
    }
  }, [canceled]);

  useEffect(() => {
    if (!listingId || !Number.isFinite(listingId)) {
      setLoadError("Missing listing");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = await fetchListing(listingId);
        if (!cancelled) {
          setListing(row);
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Listing not found");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  useEffect(() => {
    if (!token) return;
    listAddresses({ token }, "delivery")
      .then((data) => {
        setAddresses(data.addresses);
        const d = data.defaultAddress ?? data.addresses[0];
        if (d) {
          setName(d.fullName);
          setPhone(d.phone);
          setStreet(d.street);
          setCity(d.city);
          setRegion(d.region);
          setZip(d.postalCode ?? "");
          if (d.email) setEmail(d.email);
        }
      })
      .catch(() => {});
  }, [token]);

  const refreshDelivery = useCallback(async () => {
    if (!token || !listing || !city.trim()) {
      setDeliveryFee(0);
      return;
    }
    if (deliveryMethod === "pickup") {
      setDeliveryFee(0);
      return;
    }
    const sellerCity = listing.city || listing.location || "";
    if (!sellerCity) {
      setDeliveryFee(0);
      return;
    }
    setDeliveryLoading(true);
    try {
      const quote = await calculateDeliveryPrice(
        {
          sellerCity,
          buyerCity: city.trim(),
          country: listing.country || user?.country || "Haiti",
          method: deliveryMethod,
          listingPriceUsd: Number(listing.price) || 0,
        },
        { token },
      );
      setDeliveryFee(quote.feeUsd);
    } catch {
      setDeliveryFee(0);
    } finally {
      setDeliveryLoading(false);
    }
  }, [token, listing, city, deliveryMethod, user?.country]);

  useEffect(() => {
    void refreshDelivery();
  }, [refreshDelivery]);

  const onPay = async () => {
    if (!token || !listing) return;
    if (!name.trim() || !phone.trim() || !street.trim() || !city.trim()) {
      Alert.alert("Shipping required", "Name, phone, street, and city are required.");
      return;
    }
    setSubmitting(true);
    try {
      const session = await createStripeCheckoutSession(
        {
          listingId: listing.id,
          shippingName: name.trim(),
          shippingPhone: phone.trim(),
          shippingEmail: email.trim() || undefined,
          shippingStreet: street.trim(),
          shippingCity: city.trim(),
          shippingRegion: region.trim() || undefined,
          shippingZip: zip.trim() || undefined,
          shippingCountry: listing.country || user?.country || undefined,
          deliveryFeeUsd: deliveryFee > 0 ? deliveryFee : undefined,
          deliveryMethod,
        },
        { token },
      );
      if (!session.url) {
        throw new Error("Stripe did not return a checkout URL");
      }
      const result = await WebBrowser.openBrowserAsync(session.url, {
        enableBarCollapsing: true,
        showInRecents: true,
      });
      if (result.type === "cancel" || result.type === "dismiss") {
        Alert.alert(
          "Returned from Stripe",
          "If you completed payment, your order will appear under Orders shortly. If not, you can try again.",
          [
            { text: "View orders", onPress: () => router.replace("/orders") },
            { text: "OK" },
          ],
        );
      }
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "PAYMENT_METHOD_UNAVAILABLE") {
        Alert.alert("Card unavailable", err.message);
      } else if (err.code === "ANDROID_DIGITAL_PURCHASE_UNAVAILABLE") {
        Alert.alert("Not available", err.message);
      } else {
        Alert.alert("Checkout failed", err.message || "Could not start Stripe checkout");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const dominican = isDominicanListingCountry(listing?.country);
  const price = Number(listing?.price ?? 0) || 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Card checkout</Text>
        <View style={{ width: 40 }} />
      </View>

      {!listing && !loadError ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : loadError || !listing ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{loadError ?? "Listing not found"}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.summary}>
            <Text style={styles.summaryTitle} numberOfLines={2}>
              {listing.title}
            </Text>
            <Text style={styles.summaryPrice}>
              ${(price + deliveryFee).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <Text style={styles.summaryMuted}>
                (item ${price.toFixed(2)}
                {deliveryLoading ? " · delivery…" : deliveryFee ? ` · delivery $${deliveryFee.toFixed(2)}` : ""}
                )
              </Text>
            </Text>
            {dominican ? (
              <Text style={styles.drNote}>
                Dominican Republic listings use Stripe card checkout with seller shipping
                (wallet cart checkout is not available).
              </Text>
            ) : (
              <Text style={styles.drNote}>
                Pay securely with Stripe for this physical good. Server verifies payment
                via webhook before releasing the order.
              </Text>
            )}
          </View>

          {addresses.length > 0 ? (
            <View style={styles.savedBlock}>
              <Text style={styles.section}>Saved addresses</Text>
              {addresses.slice(0, 3).map((a) => (
                <Pressable
                  key={a.id}
                  style={styles.savedRow}
                  onPress={() => {
                    setName(a.fullName);
                    setPhone(a.phone);
                    setStreet(a.street);
                    setCity(a.city);
                    setRegion(a.region);
                    setZip(a.postalCode ?? "");
                  }}
                >
                  <Text style={styles.savedText} numberOfLines={1}>
                    {a.label || a.fullName} · {a.city}
                  </Text>
                  <Feather name="chevron-right" size={16} color="#94A3B8" />
                </Pressable>
              ))}
            </View>
          ) : null}

          <Text style={styles.section}>Shipping</Text>
          <Field label="Full name" value={name} onChangeText={setName} />
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Field label="Street" value={street} onChangeText={setStreet} />
          <Field label="City" value={city} onChangeText={setCity} />
          <Field label="Region / state" value={region} onChangeText={setRegion} />
          <Field label="Postal code" value={zip} onChangeText={setZip} />

          <Text style={styles.section}>Delivery method</Text>
          <View style={styles.methods}>
            {(
              [
                ["motorcycle", "Motorcycle"],
                ["car", "Car"],
                ["pickup", "Pickup"],
              ] as const
            ).map(([key, label]) => (
              <Pressable
                key={key}
                style={[styles.method, deliveryMethod === key && styles.methodOn]}
                onPress={() => setDeliveryMethod(key)}
              >
                <Text
                  style={[styles.methodText, deliveryMethod === key && styles.methodTextOn]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.payBtn, submitting && { opacity: 0.7 }]}
            onPress={() => void onPay()}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.payBtnText}>Continue to Stripe</Text>
            )}
          </Pressable>
          <Text style={styles.footerNote}>
            Opens Stripe’s secure hosted checkout in your system browser. No card details
            are entered inside the Flexa Market app.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "phone-pad" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholderTextColor="#94A3B8"
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize ?? "sentences"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  centered: { paddingTop: 40, alignItems: "center" },
  error: { color: "#B91C1C", fontWeight: "600" },
  summary: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginBottom: 12,
  },
  summaryTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  summaryPrice: { marginTop: 8, fontSize: 20, fontWeight: "800", color: "#0F172A" },
  summaryMuted: { fontSize: 13, fontWeight: "600", color: "#64748B" },
  drNote: { marginTop: 10, fontSize: 13, lineHeight: 18, color: "#64748B" },
  savedBlock: { marginBottom: 8 },
  section: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 8,
    marginBottom: 10,
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  savedText: { flex: 1, color: "#0F172A", fontWeight: "600", marginRight: 8 },
  field: { marginBottom: 12 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94A3B8",
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    color: "#0F172A",
    fontSize: 15,
  },
  methods: { flexDirection: "row", gap: 8, marginBottom: 16 },
  method: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  methodOn: { borderColor: "#F97316", backgroundColor: "#FFF7ED" },
  methodText: { fontWeight: "700", color: "#64748B", fontSize: 13 },
  methodTextOn: { color: "#C2410C" },
  payBtn: {
    height: 52,
    borderRadius: 999,
    backgroundColor: "#635BFF",
    alignItems: "center",
    justifyContent: "center",
  },
  payBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  footerNote: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
    textAlign: "center",
  },
});
