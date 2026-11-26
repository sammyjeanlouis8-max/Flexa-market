/**
 * Buyer order sheet — pick today's dishes, pickup/delivery, send chat-first request.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import { createRestaurantOrder } from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";
import type { DailyMenuItem, Restaurant } from "@/lib/restaurantTypes";

type QtyMap = Record<number, number>;

export function OrderSheet({
  visible,
  onClose,
  restaurant,
  menu,
}: {
  visible: boolean;
  onClose: () => void;
  restaurant: Restaurant;
  menu: DailyMenuItem[];
}) {
  const { token, user } = useAuth();
  const router = useRouter();
  const [qty, setQty] = useState<QtyMap>({});
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">(
    restaurant.offersDelivery ? "delivery" : "pickup",
  );
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = useMemo(
    () => menu.filter((m) => m.available && !m.soldOut),
    [menu],
  );

  const lines = useMemo(
    () =>
      available
        .filter((m) => (qty[m.id] || 0) > 0)
        .map((m) => ({ item: m, q: qty[m.id] })),
    [available, qty],
  );

  const subtotal = lines.reduce((s, l) => s + l.item.price * l.q, 0);
  const deliveryFee =
    fulfillment === "delivery" && restaurant.deliveryFeeUsd != null
      ? restaurant.deliveryFeeUsd
      : 0;

  const bump = (id: number, delta: number) => {
    setQty((prev) => {
      const next = Math.max(0, Math.min(99, (prev[id] || 0) + delta));
      return { ...prev, [id]: next };
    });
  };

  const submit = async () => {
    if (!token) return;
    if (user?.id === restaurant.ownerUserId) {
      setError("You cannot order from your own restaurant.");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one dish.");
      return;
    }
    if (!restaurant.isOpenNow) {
      setError("Kitchen is closed right now.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createRestaurantOrder(
        restaurant.id,
        {
          fulfillment,
          note: note.trim() || null,
          items: lines.map((l) => ({ dailyMenuItemId: l.item.id, qty: l.q })),
        },
        { token },
      );
      onClose();
      if (result.conversationId) {
        router.push(`/chat/${result.conversationId}` as never);
      } else {
        router.push("/restaurant/orders" as never);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>Order · {restaurant.name}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Feather name="x" size={20} color={T.ink} />
            </Pressable>
          </View>
          <Text style={styles.sub}>Chat-first request — kitchen confirms in Messages</Text>

          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
            {available.length === 0 ? (
              <Text style={styles.empty}>No available dishes on today’s menu.</Text>
            ) : (
              available.map((m) => (
                <View key={m.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dish}>{m.name}</Text>
                    <Text style={styles.price}>
                      {m.currency} {m.price.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable style={styles.stepBtn} onPress={() => bump(m.id, -1)}>
                      <Feather name="minus" size={14} color={T.forest} />
                    </Pressable>
                    <Text style={styles.qty}>{qty[m.id] || 0}</Text>
                    <Pressable style={styles.stepBtn} onPress={() => bump(m.id, 1)}>
                      <Feather name="plus" size={14} color={T.forest} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}

            <Text style={styles.label}>Fulfillment</Text>
            <View style={styles.fulfill}>
              <Pressable
                style={[styles.fulChip, fulfillment === "pickup" && styles.fulOn]}
                onPress={() => setFulfillment("pickup")}
              >
                <Text style={[styles.fulText, fulfillment === "pickup" && styles.fulTextOn]}>
                  Pickup
                </Text>
              </Pressable>
              {restaurant.offersDelivery ? (
                <Pressable
                  style={[styles.fulChip, fulfillment === "delivery" && styles.fulOn]}
                  onPress={() => setFulfillment("delivery")}
                >
                  <Text style={[styles.fulText, fulfillment === "delivery" && styles.fulTextOn]}>
                    Delivery
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.label}>Note for kitchen</Text>
            <TextInput
              style={styles.note}
              value={note}
              onChangeText={setNote}
              placeholder="No onions, call on arrival…"
              placeholderTextColor="#94A3B8"
              multiline
            />
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.total}>
              Total ${ (subtotal + deliveryFee).toFixed(2) }
              {deliveryFee > 0 ? ` (incl. $${deliveryFee.toFixed(2)} delivery)` : ""}
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={[styles.cta, (submitting || lines.length === 0) && { opacity: 0.6 }]}
              disabled={submitting || lines.length === 0}
              onPress={() => void submit()}
              testID="restaurant-order-submit"
            >
              {submitting ? (
                <ActivityIndicator color={T.white} />
              ) : (
                <>
                  <Feather name="message-circle" size={16} color={T.white} />
                  <Text style={styles.ctaText}>Send order to kitchen</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: T.mintSoft,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    paddingBottom: 28,
    maxHeight: "92%",
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 17, fontWeight: "800", color: T.ink, flex: 1, paddingRight: 8 },
  sub: { marginTop: 4, marginBottom: 12, fontSize: 12, color: T.muted },
  empty: { color: T.muted, fontWeight: "600", paddingVertical: 20, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  dish: { fontSize: 14, fontWeight: "800", color: T.ink },
  price: { marginTop: 2, fontSize: 12, fontWeight: "700", color: T.forest },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  qty: { minWidth: 18, textAlign: "center", fontWeight: "800", color: T.ink },
  label: { marginTop: 10, marginBottom: 6, fontSize: 12, fontWeight: "800", color: T.forest },
  fulfill: { flexDirection: "row", gap: 8 },
  fulChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.line,
  },
  fulOn: { backgroundColor: T.mint, borderColor: T.accent },
  fulText: { fontWeight: "700", color: T.muted, fontSize: 13 },
  fulTextOn: { color: T.forest },
  note: {
    backgroundColor: T.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    padding: 12,
    minHeight: 64,
    textAlignVertical: "top",
    fontWeight: "600",
    color: T.ink,
  },
  footer: { marginTop: 12, gap: 8 },
  total: { fontSize: 14, fontWeight: "800", color: T.ink },
  error: { color: T.danger, fontWeight: "600" },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: T.forest,
    borderRadius: 12,
    paddingVertical: 14,
  },
  ctaText: { color: T.white, fontWeight: "800", fontSize: 14 },
});
