/**
 * Post-checkout confirmation after Stripe payment is started/completed.
 */
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function CheckoutSuccessScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    listingTitle,
    amount,
    deliveryTotal: deliveryRaw,
    remaining: remainingRaw,
    browserResult,
  } = useLocalSearchParams<{
    payment?: string;
    listingTitle?: string;
    amount?: string;
    deliveryTotal?: string;
    remaining?: string;
    browserResult?: string;
  }>();

  const deliveryTotal = Number(deliveryRaw || 0) || 0;
  const productTotal = Number(amount || 0) || 0;
  const grandTotal = Math.round((productTotal + deliveryTotal) * 100) / 100;
  const remaining = Number(remainingRaw || 0) || 0;
  const maybeIncomplete =
    browserResult === "cancel" || browserResult === "dismiss";

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: Math.max(insets.bottom, 24) + 24,
          alignItems: "center",
        }}
      >
        <View style={styles.iconWrap}>
          <Feather
            name={maybeIncomplete ? "info" : "check-circle"}
            size={40}
            color={maybeIncomplete ? "#F97316" : "#059669"}
          />
        </View>
        <Text style={styles.title}>
          {maybeIncomplete ? "Returned from Stripe" : "Stripe checkout started"}
        </Text>
        <Text style={styles.sub}>
          {maybeIncomplete
            ? "If you finished paying in Stripe, your order will appear under Orders shortly. Wallet balances are never used for Android checkout."
            : "Payment is processed by Stripe only. No FM Wallet or Card FM balance was debited."}
        </Text>
        {listingTitle ? (
          <View style={styles.list}>
            <View style={styles.row}>
              <View style={styles.pkg}>
                <Feather name="package" size={18} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {listingTitle}
                </Text>
                <Text style={styles.rowMeta}>
                  ${productTotal.toFixed(2)}
                  {deliveryTotal > 0
                    ? ` · ship $${deliveryTotal.toFixed(2)}`
                    : ""}
                  {grandTotal > 0 ? ` · total $${grandTotal.toFixed(2)}` : ""}
                </Text>
              </View>
              <Text style={styles.paid}>Stripe</Text>
            </View>
          </View>
        ) : null}

        {remaining > 0 ? (
          <Text style={styles.remaining}>
            {remaining} more item(s) remain in your cart — pay each with Stripe.
          </Text>
        ) : null}

        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.replace("/orders")}
        >
          <Text style={styles.primaryBtnText}>View orders</Text>
        </Pressable>
        {remaining > 0 ? (
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => router.replace("/cart")}
          >
            <Text style={styles.secondaryBtnText}>Back to cart</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.secondaryBtnText}>Continue shopping</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  sub: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 20,
  },
  list: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  pkg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontWeight: "700", color: "#0F172A", fontSize: 14 },
  rowMeta: { color: "#64748B", fontSize: 12, marginTop: 2 },
  paid: { fontWeight: "800", color: "#635BFF", fontSize: 12 },
  remaining: {
    fontSize: 13,
    color: "#C2410C",
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
  },
  primaryBtn: {
    width: "100%",
    height: 50,
    borderRadius: 14,
    backgroundColor: "#635BFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryBtn: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  secondaryBtnText: { color: "#0F172A", fontWeight: "700", fontSize: 14 },
});
