import { StateView } from "@/components/StateView";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type OrderDetail = {
  orderId: number;
  orderRef?: string;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  orderStatus?: string;
  trackingNumber?: string | null;
  carrier?: string | null;
  trackingStatus?: string | null;
  isHaiti?: boolean;
  haitiPinConfirmation?: boolean;
  carrierPodEligible?: boolean;
  confirmationMode?: string;
  isBuyer?: boolean;
  isSeller?: boolean;
  listing?: { id: number; title: string; images?: string[] | null; country?: string | null };
  merchant?: { name?: string; phone?: string | null };
  buyer?: { name?: string | null };
  shipTo?: {
    name?: string | null;
    phone?: string | null;
    street?: string | null;
    city?: string | null;
    region?: string | null;
    zip?: string | null;
    country?: string | null;
  };
  fmDelivery?: {
    id?: number;
    status?: string;
    verificationCode?: string;
    trackingNumber?: string | null;
  } | null;
  deliveryMethod?: string | null;
  sellerEarnings?: number | null;
  commissionAmount?: number | null;
  cardRefundStatus?: string | null;
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trackingEvents, setTrackingEvents] = useState<any[]>([]);
  const [shipCarrier, setShipCarrier] = useState("");
  const [shipTracking, setShipTracking] = useState("");
  useAndroidBack();

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/orders/${id}`, { token, auth: true });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Order unavailable (${res.status})`);
      setOrder(data);

      // International tracking — only when carrier tracking exists; never invent data.
      if (data.trackingNumber || data.carrier) {
        const trackRes = await apiFetch(`/orders/${id}/tracking`, { token, auth: true });
        if (trackRes.ok) {
          const track = await trackRes.json().catch(() => ({}));
          setTrackingEvents(Array.isArray(track.events) ? track.events : []);
        } else {
          setTrackingEvents([]);
        }
      } else {
        setTrackingEvents([]);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load order.");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancelOrder() {
    if (!token || !order) return;
    Alert.alert("Cancel order", "Cancel this order if still eligible?", [
      { text: "No", style: "cancel" },
      {
        text: "Cancel order",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            const res = await apiFetch(`/transactions/${order.orderId}/cancel`, {
              method: "POST",
              token,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Cancel failed (${res.status})`);
            Alert.alert(
              "Cancellation",
              data.walletRefunded
                ? `Refunded $${Number(data.refundAmount || 0).toFixed(2)} to wallet.`
                : data.refundStatus
                  ? `Card refund status: ${data.refundStatus}`
                  : "Cancellation submitted.",
            );
            await load();
          } catch (e: any) {
            Alert.alert("Error", e?.message || "Could not cancel.");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  async function sellerReject() {
    if (!token || !order) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/orders/${order.orderId}/seller-reject`, {
        method: "POST",
        token,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Reject failed (${res.status})`);
      Alert.alert("Order rejected", `Buyer refunded $${Number(data.refundAmount || 0).toFixed(2)}.`);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not reject.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelivery() {
    if (!token || !order) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/orders/${order.orderId}/confirm-delivery`, {
        method: "POST",
        token,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Confirm failed (${res.status})`);
      Alert.alert("Thanks", "Delivery confirmed.");
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not confirm delivery.");
    } finally {
      setBusy(false);
    }
  }

  async function shipOrder() {
    if (!token || !order) return;
    if (!shipCarrier.trim() || !shipTracking.trim()) {
      Alert.alert("Shipping", "Carrier and tracking number are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/orders/${order.orderId}/ship`, {
        method: "POST",
        token,
        body: JSON.stringify({
          carrier: shipCarrier.trim(),
          trackingNumber: shipTracking.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Ship failed (${res.status})`);
      Alert.alert("Shipped", "Tracking registered with the existing shipping service.");
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not mark shipped.");
    } finally {
      setBusy(false);
    }
  }

  const image = resolveMediaUrl(order?.listing?.images?.[0] ?? null);
  const pin =
    order?.isBuyer && order?.haitiPinConfirmation
      ? order.fmDelivery?.verificationCode
      : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/orders"))}
        >
          <Feather name="arrow-left" size={20} color="#F8FAFC" />
        </Pressable>
        <Text style={styles.brand}>Flexa Market</Text>
        <View style={styles.iconBtn} />
      </View>

      <StateView loading={loading} error={!order ? error : null} onRetry={load}>
        {order ? (
          <ScrollView contentContainerStyle={styles.content}>
            {image ? (
              <Image source={{ uri: image }} style={styles.hero} contentFit="cover" />
            ) : null}
            <Text style={styles.ref}>{order.orderRef || `Order #${order.orderId}`}</Text>
            <Text style={styles.title}>{order.listing?.title}</Text>
            <Text style={styles.meta}>
              Status: {order.orderStatus} · Payment: {order.paymentMethod} ({order.paymentStatus})
            </Text>
            <Text style={styles.amount}>$ {Number(order.amount || 0).toLocaleString()}</Text>

            <Text style={styles.section}>Shipping</Text>
            <Text style={styles.body}>
              {[order.shipTo?.name, order.shipTo?.phone, order.shipTo?.street, order.shipTo?.city, order.shipTo?.region, order.shipTo?.zip, order.shipTo?.country]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <Text style={styles.meta}>
              Confirmation mode: {order.confirmationMode || "—"}
              {order.haitiPinConfirmation ? " · Haiti PIN verification" : ""}
              {order.carrierPodEligible ? " · Carrier POD eligible" : ""}
            </Text>

            {pin ? (
              <View style={styles.pinBox}>
                <Text style={styles.pinLabel}>Delivery PIN (share only with driver at drop-off)</Text>
                <Text style={styles.pin}>{pin}</Text>
              </View>
            ) : null}

            {order.fmDelivery?.id ? (
              <Pressable
                style={styles.secondary}
                onPress={() =>
                  router.push({
                    pathname: "/delivery-tracking",
                    params: { id: String(order.fmDelivery!.id) },
                  })
                }
              >
                <Text style={styles.secondaryText}>
                  Open FM delivery tracking ({order.fmDelivery.status || "status"})
                </Text>
              </Pressable>
            ) : null}

            {order.trackingNumber ? (
              <>
                <Text style={styles.section}>Carrier tracking</Text>
                <Text style={styles.body}>
                  {order.carrier || "Carrier"} · {order.trackingNumber}
                  {order.trackingStatus ? ` · ${order.trackingStatus}` : ""}
                </Text>
                {trackingEvents.length === 0 ? (
                  <Text style={styles.meta}>No tracking events returned yet.</Text>
                ) : (
                  trackingEvents.slice(0, 8).map((ev, idx) => (
                    <Text key={idx} style={styles.event}>
                      {ev.message || ev.description || ev.status || JSON.stringify(ev)}
                    </Text>
                  ))
                )}
              </>
            ) : (
              <Text style={styles.meta}>No carrier tracking on this order yet.</Text>
            )}

            {order.isSeller ? (
              <>
                <Text style={styles.section}>Seller tools</Text>
                <Text style={styles.meta}>
                  Earnings ${Number(order.sellerEarnings || 0).toFixed(2)} · Commission $
                  {Number(order.commissionAmount || 0).toFixed(2)}
                </Text>
                {!order.trackingNumber && !order.isHaiti ? (
                  <>
                    <TextInput
                      style={styles.input}
                      placeholder="Carrier"
                      placeholderTextColor="#64748B"
                      value={shipCarrier}
                      onChangeText={setShipCarrier}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Tracking number"
                      placeholderTextColor="#64748B"
                      value={shipTracking}
                      onChangeText={setShipTracking}
                    />
                    <Pressable style={styles.primary} disabled={busy} onPress={() => void shipOrder()}>
                      <Text style={styles.primaryText}>Mark shipped</Text>
                    </Pressable>
                  </>
                ) : null}
                {order.orderStatus === "ready_to_ship" ? (
                  <Pressable style={styles.danger} disabled={busy} onPress={() => void sellerReject()}>
                    <Text style={styles.primaryText}>Reject & refund buyer</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}

            {order.isBuyer ? (
              <>
                <Text style={styles.section}>Buyer actions</Text>
                <Pressable style={styles.secondary} disabled={busy} onPress={() => void confirmDelivery()}>
                  <Text style={styles.secondaryText}>Confirm delivery</Text>
                </Pressable>
                <Pressable style={styles.danger} disabled={busy} onPress={() => void cancelOrder()}>
                  <Text style={styles.primaryText}>Cancel (if eligible)</Text>
                </Pressable>
              </>
            ) : null}

            <Text style={styles.note}>
              Order state transitions, refunds, commissions, and Haiti PIN rules are enforced by the
              existing backend. This screen does not invent tracking or bypass PIN delivery verification.
            </Text>
          </ScrollView>
        ) : null}
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
  content: { padding: 16, paddingBottom: 48, gap: 6 },
  hero: { width: "100%", height: 180, borderRadius: 14, backgroundColor: "#1E293B", marginBottom: 8 },
  ref: { color: "#94A3B8", fontSize: 12 },
  title: { color: "#F8FAFC", fontSize: 20, fontWeight: "800" },
  meta: { color: "#94A3B8", fontSize: 12 },
  amount: { color: "#F97316", fontSize: 22, fontWeight: "800", marginVertical: 6 },
  section: { marginTop: 14, color: "#F8FAFC", fontWeight: "700", fontSize: 15 },
  body: { color: "#CBD5E1", fontSize: 14, lineHeight: 20 },
  pinBox: {
    marginTop: 10,
    backgroundColor: "#14532D",
    borderRadius: 12,
    padding: 14,
  },
  pinLabel: { color: "#BBF7D0", fontSize: 12 },
  pin: { color: "#fff", fontSize: 28, fontWeight: "800", letterSpacing: 4, marginTop: 4 },
  event: { color: "#CBD5E1", fontSize: 12, marginTop: 4 },
  input: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#F8FAFC",
    marginTop: 8,
  },
  primary: {
    marginTop: 10,
    backgroundColor: "#F97316",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  secondary: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  danger: {
    marginTop: 10,
    backgroundColor: "#7F1D1D",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondaryText: { color: "#F8FAFC", fontWeight: "600" },
  note: { marginTop: 18, color: "#64748B", fontSize: 12, lineHeight: 18 },
});
