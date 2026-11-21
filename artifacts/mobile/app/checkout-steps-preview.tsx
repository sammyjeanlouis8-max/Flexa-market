/**
 * Dev visual preview of native checkout steps (address / shipping / payment).
 * Used for website↔app side-by-side screenshots when Expo web deep-links race
 * the Root Layout. Production flow remains /cart → /checkout (Stripe-only).
 */
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Step = "address" | "shipping" | "payment";

export default function CheckoutStepsPreview() {
  const insets = useSafeAreaInsets();
  const { step: stepParam } = useLocalSearchParams<{ step?: string }>();
  const step: Step =
    stepParam === "shipping" || stepParam === "payment" ? stepParam : "address";
  const [method, setMethod] = useState<"motorcycle" | "car">("motorcycle");
  const stepIndex = step === "address" ? 0 : step === "shipping" ? 1 : 2;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <View style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>Checkout</Text>
          <Text style={styles.topSub}>
            Step {stepIndex + 1} of 4 ·{" "}
            {step === "address"
              ? "Shipping address"
              : step === "shipping"
                ? "Shipping method"
                : "Payment"}
          </Text>
        </View>
      </View>
      <View style={styles.progress}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[styles.dot, i <= stepIndex && styles.dotOn]}
          />
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Text style={styles.label}>Order</Text>
          <Text style={styles.summary}>1 item(s) · $4.00</Text>
          <Text style={styles.item}>1× Ventilateur Oscillant Rechargeable</Text>
        </View>

        {step === "address" ? (
          <View style={styles.card}>
            <Text style={styles.label}>Shipping address</Text>
            {(
              [
                ["Full name *", "Test Buyer"],
                ["Phone *", "5095551234"],
                ["Email", "buyer@example.com"],
                ["Street *", "Delmas 33"],
                ["City *", "Port-au-Prince"],
                ["Region (optional)", "Ouest"],
              ] as const
            ).map(([label, value]) => (
              <View key={label} style={styles.field}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <TextInput
                  value={value}
                  editable={false}
                  style={styles.input}
                />
              </View>
            ))}
          </View>
        ) : null}

        {step === "shipping" ? (
          <View style={styles.card}>
            <Text style={styles.label}>Shipping method</Text>
            <Text style={styles.hint}>Delivery to Port-au-Prince · Haiti</Text>
            {(
              [
                ["motorcycle", "Motorcycle", "Fast local delivery"],
                ["car", "Car", "Larger packages"],
              ] as const
            ).map(([id, title, sub]) => (
              <Pressable
                key={id}
                style={[styles.method, method === id && styles.methodOn]}
                onPress={() => setMethod(id)}
              >
                <Feather
                  name={id === "motorcycle" ? "truck" : "box"}
                  size={20}
                  color={method === id ? "#F97316" : "#64748B"}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.methodTitle}>{title}</Text>
                  <Text style={styles.hint}>{sub}</Text>
                </View>
                <Feather
                  name={method === id ? "check-circle" : "circle"}
                  size={20}
                  color={method === id ? "#F97316" : "#CBD5E1"}
                />
              </Pressable>
            ))}
            <View style={styles.feeRow}>
              <Text style={styles.hint}>Estimated shipping</Text>
              <Text style={styles.summary}>$2.50</Text>
            </View>
          </View>
        ) : null}

        {step === "payment" ? (
          <View style={styles.card}>
            <Text style={styles.label}>Payment</Text>
            <View style={[styles.method, styles.methodOn]}>
              <Feather name="credit-card" size={20} color="#635BFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.methodTitle}>Stripe</Text>
                <Text style={styles.hint}>
                  Pay securely by card. The only payment method in this app for
                  physical goods.
                </Text>
              </View>
              <Feather name="check-circle" size={20} color="#635BFF" />
            </View>
            <Text style={styles.hint}>
              FM Wallet, Flexa Card, MonCash, and other balances are not available
              for checkout in the Android app.
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>Continue</Text>
        </View>
      </View>
    </View>
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
    marginBottom: 8,
  },
  dot: { flex: 1, height: 4, borderRadius: 999, backgroundColor: "#E2E8F0" },
  dotOn: { backgroundColor: "#F97316" },
  body: { padding: 16, gap: 14, paddingBottom: 120 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  summary: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  item: { fontSize: 13, color: "#64748B" },
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
  method: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  methodOn: { borderColor: "#A5B4FC", backgroundColor: "#EEF2FF" },
  methodTitle: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  cta: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
});
