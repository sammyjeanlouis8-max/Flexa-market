/**
 * Native Order Details — GET /api/orders/:id
 * Haiti domestic PIN only shown when server returns verificationCode to the buyer.
 * International carrier tracking via GET /api/orders/:id/tracking when available.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { rateDriver, tipDriver } from "@/lib/deliveryFeedbackApi";
import {
  confirmDelivery,
  fetchOrderDetail,
  fetchOrderTracking,
  type CarrierTracking,
  type OrderDetail,
} from "@/lib/ordersApi";
import {
  formatDate,
  formatMoney,
  listStatusLabel,
  orderRef,
} from "@/lib/orderUi";

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [tracking, setTracking] = useState<CarrierTracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [tipAmount, setTipAmount] = useState("2");
  const [driverRating, setDriverRating] = useState(5);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token || !id) return;
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const detail = await fetchOrderDetail(id, { token });
        setOrder(detail);
        // Carrier tracking only when a tracking number exists (non-PIN flow).
        if (detail.trackingNumber && !detail.haitiPinConfirmation) {
          const t = await fetchOrderTracking(id, { token });
          setTracking(t);
        } else {
          setTracking(null);
        }
      } catch (e) {
        setOrder(null);
        setError(e instanceof Error ? e.message : "Could not load order");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, id],
  );

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace("/auth/login");
      return;
    }
    if (token) void load("initial");
  }, [authLoading, token, load, router]);

  const onConfirm = async () => {
    if (!token || !id) return;
    setConfirming(true);
    try {
      const result = await confirmDelivery(id, { token });
      if (!result.ok) {
        Alert.alert("Could not confirm", result.error ?? "Try again");
        return;
      }
      await load("refresh");
      setShowFeedback(true);
    } finally {
      setConfirming(false);
    }
  };

  const onSubmitFeedback = async () => {
    if (!token || !order?.fmDelivery?.id) {
      Alert.alert("Unavailable", "No Flexa delivery is linked to tip or rate.");
      setShowFeedback(false);
      return;
    }
    const deliveryId = order.fmDelivery.id;
    const amount = Number(tipAmount);
    setFeedbackBusy(true);
    try {
      if (!Number.isNaN(amount) && amount >= 0.5) {
        const tip = await tipDriver(
          deliveryId,
          {
            amount,
            message: feedbackNote.trim() || undefined,
            rating: driverRating,
          },
          { token },
        );
        if (!tip.ok && !tip.alreadyTipped) {
          Alert.alert("Tip", tip.error ?? "Could not tip");
        }
      }
      const rate = await rateDriver(
        deliveryId,
        {
          rating: driverRating,
          comment: feedbackNote.trim() || undefined,
        },
        { token },
      );
      if (!rate.ok && !rate.alreadyRated) {
        Alert.alert("Rating", rate.error ?? "Could not rate driver");
      } else {
        Alert.alert("Thanks", "Delivery feedback submitted.");
      }
      setShowFeedback(false);
    } finally {
      setFeedbackBusy(false);
    }
  };

  const status = order
    ? listStatusLabel({
        orderStatus: order.orderStatus,
        deliveryStatus: order.fmDelivery?.status ?? null,
        trackingStatus: order.trackingStatus,
      })
    : null;

  const pin =
    order?.isBuyer &&
    order.haitiPinConfirmation &&
    order.fmDelivery?.verificationCode
      ? order.fmDelivery.verificationCode
      : null;

  const img = order?.listing?.images?.[0] ?? null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/orders")
          }
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.topTitle}>Order details</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading || authLoading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 48 }} />
      ) : error || !order ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error ?? "Order not found"}</Text>
          <Text style={styles.hint}>
            You can only view orders you bought or sold. Access is enforced by
            the server.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => load("initial")}>
            <Text style={styles.primaryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 40,
            gap: 12,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load("refresh")}
              tintColor="#F97316"
            />
          }
        >
          <View style={styles.card}>
            <View style={styles.row}>
              {img ? (
                <Image
                  source={{ uri: img }}
                  style={styles.thumb}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Feather name="image" size={20} color="#94A3B8" />
                </View>
              )}
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.title}>{order.listing.title}</Text>
                <Text style={styles.muted}>
                  {order.orderRef || orderRef(order.orderId)} ·{" "}
                  {formatDate(order.createdAt)}
                </Text>
                <Text style={styles.price}>
                  {formatMoney(order.amount, order.currency)}
                </Text>
                {status ? (
                  <View style={[styles.badge, { backgroundColor: status.bg }]}>
                    <Text style={[styles.badgeText, { color: status.color }]}>
                      {status.label}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <Pressable
              onPress={() => router.push(`/listing/${order.listing.id}`)}
            >
              <Text style={styles.link}>View product</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>Payment</Text>
            <Text style={styles.line}>
              Method:{" "}
              {order.paymentMethod === "wallet"
                ? "Flexa Wallet (Card FM)"
                : order.paymentMethod ?? "—"}
            </Text>
            <Text style={styles.line}>
              Status: {order.paymentStatus ?? "—"}
            </Text>
            <Text style={styles.line}>
              Role: {order.isBuyer ? "Buyer" : order.isSeller ? "Seller" : "—"}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>Shipping</Text>
            <Text style={styles.line}>
              {[order.shipTo.name, order.shipTo.phone]
                .filter(Boolean)
                .join(" · ") || "—"}
            </Text>
            <Text style={styles.line}>
              {[
                order.shipTo.street,
                order.shipTo.city,
                order.shipTo.region,
                order.shipTo.zip,
                order.shipTo.country ?? order.listingCountry,
              ]
                .filter(Boolean)
                .join(", ") || "—"}
            </Text>
            {order.deliveryMethod ? (
              <Text style={styles.line}>
                Method: {order.deliveryMethod}
              </Text>
            ) : null}
            {order.merchant?.name ? (
              <Text style={styles.line}>Seller: {order.merchant.name}</Text>
            ) : null}
          </View>

          {pin ? (
            <View style={[styles.card, styles.pinCard]}>
              <Text style={styles.section}>Haiti delivery PIN</Text>
              <Text style={styles.pin}>{pin}</Text>
              <Text style={styles.muted}>
                Share this PIN only with the Flexa Market driver when they arrive.
                Sellers and unauthorized users never receive this code from the
                API.
              </Text>
            </View>
          ) : order.haitiPinConfirmation && order.isBuyer ? (
            <View style={styles.card}>
              <Text style={styles.section}>Delivery PIN</Text>
              <Text style={styles.muted}>
                PIN will appear here when a driver is assigned for Haiti domestic
                delivery.
              </Text>
            </View>
          ) : null}

          {order.fmDelivery ? (
            <View style={styles.card}>
              <Text style={styles.section}>Flexa delivery</Text>
              <Text style={styles.line}>
                Status: {order.fmDelivery.status ?? "—"}
              </Text>
              {order.fmDelivery.driverInfo?.name || order.driverName ? (
                <Text style={styles.line}>
                  Driver:{" "}
                  {order.fmDelivery.driverInfo?.name ?? order.driverName}
                </Text>
              ) : null}
              <Pressable
                style={styles.secondaryBtn}
                onPress={() =>
                  router.push({
                    pathname: "/delivery-tracking",
                    params: { id: String(order.fmDelivery!.id) },
                  })
                }
              >
                <Text style={styles.secondaryBtnText}>Live tracking</Text>
              </Pressable>
            </View>
          ) : null}

          {order.trackingNumber ? (
            <View style={styles.card}>
              <Text style={styles.section}>Carrier tracking</Text>
              <Text style={styles.line}>
                {order.carrier ?? "Carrier"} · {order.trackingNumber}
              </Text>
              <Text style={styles.line}>
                Status: {order.trackingStatus ?? tracking?.status ?? "—"}
              </Text>
              {tracking?.checkpoints?.slice(0, 5).map((c, i) => (
                <Text key={i} style={styles.muted}>
                  {[c.time, c.location, c.message || c.status]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              ))}
              {tracking?.error ? (
                <Text style={styles.errorInline}>{tracking.error}</Text>
              ) : null}
            </View>
          ) : null}

          {order.isBuyer &&
          !["delivered", "completed", "cancelled", "return_refunded"].includes(
            order.orderStatus,
          ) &&
          (order.fmDelivery?.status === "arrived" ||
            order.trackingStatus === "delivered" ||
            order.orderStatus === "shipped") ? (
            <Pressable
              style={[styles.primaryBtn, confirming && { opacity: 0.7 }]}
              onPress={onConfirm}
              disabled={confirming}
            >
              {confirming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Confirm delivery</Text>
              )}
            </Pressable>
          ) : null}

          {order.isBuyer &&
          order.fmDelivery?.id &&
          (showFeedback ||
            ["delivered", "completed"].includes(order.orderStatus) ||
            order.fmDelivery.status === "delivered") ? (
            <View style={styles.card}>
              <Text style={styles.section}>Driver tip & rating</Text>
              <Text style={styles.muted}>
                Tip credits the driver’s Flexa wallet (min $0.50). Rating is
                required for feedback.
              </Text>
              <TextInput
                value={tipAmount}
                onChangeText={setTipAmount}
                keyboardType="decimal-pad"
                placeholder="Tip USD"
                placeholderTextColor="#94A3B8"
                style={styles.input}
                testID="input-tip-amount"
              />
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => setDriverRating(n)}>
                    <Feather
                      name="star"
                      size={22}
                      color={n <= driverRating ? "#F97316" : "#CBD5E1"}
                    />
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={feedbackNote}
                onChangeText={setFeedbackNote}
                placeholder="Optional note"
                placeholderTextColor="#94A3B8"
                style={styles.input}
              />
              <Pressable
                style={[styles.primaryBtn, feedbackBusy && { opacity: 0.7 }]}
                onPress={onSubmitFeedback}
                disabled={feedbackBusy}
                testID="btn-submit-delivery-feedback"
              >
                {feedbackBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Submit tip & rating</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}
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
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  starsRow: { flexDirection: "row", gap: 8, marginVertical: 4 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 8,
  },
  pinCard: { borderColor: "#FDBA74", backgroundColor: "#FFF7ED" },
  row: { flexDirection: "row", gap: 12 },
  thumb: { width: 84, height: 84, borderRadius: 12, backgroundColor: "#E2E8F0" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  price: { fontSize: 18, fontWeight: "900", color: "#0F172A" },
  muted: { fontSize: 13, color: "#64748B", lineHeight: 18 },
  section: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  line: { fontSize: 14, color: "#334155", fontWeight: "600" },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: "800" },
  pin: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 4,
    color: "#C2410C",
  },
  link: { color: "#F97316", fontWeight: "800", fontSize: 13 },
  primaryBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryBtn: {
    marginTop: 4,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: "#0F172A", fontWeight: "800" },
  centered: { alignItems: "center", padding: 32, gap: 12 },
  error: { color: "#B91C1C", fontWeight: "700", textAlign: "center" },
  errorInline: { color: "#B91C1C", fontSize: 12, fontWeight: "600" },
  hint: { color: "#64748B", textAlign: "center", fontSize: 13, lineHeight: 18 },
});
