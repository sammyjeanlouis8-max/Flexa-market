/**
 * Native iOS subscription screen — Apple IAP via RevenueCat only.
 * Stripe / wallet checkout is intentionally unavailable on iOS (App Store rules).
 */
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useRevenueCat } from "@/hooks/useRevenueCat";
import {
  FALLBACK_PRICE_LABEL,
  type PaidPlanId,
} from "@/lib/revenuecat/products";
import { isStripeSubscriptionCheckoutBlockedOnIos } from "@/lib/revenuecat/client";

const PLANS: {
  id: PaidPlanId;
  title: string;
  features: string[];
}[] = [
  {
    id: "standard",
    title: "Standard",
    features: [
      "Jiska 50 lis aktif",
      "Badge vandè verifye",
      "Statistik lavant",
      "Sipò prioritè",
    ],
  },
  {
    id: "premium",
    title: "Premium",
    features: [
      "Lis ilimite",
      "Badge Premium",
      "Upload videyo pou lis",
      "Sipò VIP",
    ],
  },
];

export default function SubscriptionScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const iap = useRevenueCat();
  const [message, setMessage] = useState<string | null>(null);

  const stripeBlocked = isStripeSubscriptionCheckoutBlockedOnIos();

  if (Platform.OS !== "ios") {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
        edges={["top", "left", "right"]}
      >
        <View style={styles.body}>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: colors.mutedForeground }}>Retounen</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Abònman
          </Text>
          <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>
            Achte abònman dijital sou Android ap vini ak Google Play Billing
            (RevenueCat). Sou iOS, Apple IAP obligatwa.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.mutedForeground }}>Retounen</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Flexa Market Premium
        </Text>
        <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>
          Abònman atravè Apple In-App Purchase (RevenueCat). Pa gen Stripe sou
          iOS pou kontni dijital.
        </Text>

        {stripeBlocked ? (
          <View style={[styles.banner, { borderColor: colors.border }]}>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
              Checkout Stripe / wallet bloke sou iOS — règleman App Store.
            </Text>
          </View>
        ) : null}

        {!token ? (
          <Pressable
            onPress={() => router.push("/auth/login")}
            style={[styles.cta, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.ctaText}>Konekte pou abònman</Text>
          </Pressable>
        ) : null}

        {iap.error ? (
          <Text style={{ color: "#F87171" }}>{iap.error}</Text>
        ) : null}
        {message ? (
          <Text style={{ color: colors.foreground }}>{message}</Text>
        ) : null}

        {PLANS.map((plan) => {
          const store = iap.productFor(plan.id);
          const price =
            store?.priceString || FALLBACK_PRICE_LABEL[plan.id];
          const active = iap.activePlans.includes(plan.id);
          return (
            <View
              key={plan.id}
              style={[styles.card, { borderColor: colors.border }]}
            >
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                {plan.title} — {price}/mwa
              </Text>
              {plan.features.map((f) => (
                <Text
                  key={f}
                  style={{ color: colors.mutedForeground, marginTop: 4 }}
                >
                  ✓ {f}
                </Text>
              ))}
              {active ? (
                <Text style={[styles.active, { color: colors.primary }]}>
                  Plan aktif
                </Text>
              ) : (
                <Pressable
                  disabled={!token || !iap.identified || iap.busy || !store}
                  onPress={async () => {
                    setMessage(null);
                    const outcome = await iap.buy(plan.id);
                    if (outcome.status === "purchased") {
                      setMessage(
                        "Acha reyisi. Abònman ap aktive atravè RevenueCat (kèk segonn).",
                      );
                    } else if (outcome.status === "cancelled") {
                      setMessage("Acha anile.");
                    } else {
                      setMessage(outcome.message);
                    }
                  }}
                  style={[
                    styles.cta,
                    {
                      backgroundColor: colors.primary,
                      opacity:
                        !token || !iap.identified || iap.busy || !store
                          ? 0.5
                          : 1,
                    },
                  ]}
                >
                  {iap.busy ? (
                    <ActivityIndicator color="#0F172A" />
                  ) : (
                    <Text style={styles.ctaText}>
                      {store
                        ? `Kòmanse · ${store.priceString}`
                        : "Pwodui ap chaje…"}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          );
        })}

        <Pressable
          disabled={!token || !iap.identified || iap.busy}
          onPress={async () => {
            setMessage(null);
            try {
              await iap.restore();
              setMessage("Restore fini. Verifye plan aktif ou.");
            } catch (err) {
              setMessage(
                err instanceof Error ? err.message : "Restore echwe.",
              );
            }
          }}
          style={[styles.secondary, { borderColor: colors.border }]}
        >
          <Text style={{ color: colors.foreground, fontWeight: "600" }}>
            Restore purchases
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void iap.openManageSubscriptions()}
          style={[styles.secondary, { borderColor: colors.border }]}
        >
          <Text style={{ color: colors.foreground, fontWeight: "600" }}>
            Jere abònman Apple
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: "700", marginTop: 8 },
  banner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    backgroundColor: "#1E293B",
    gap: 4,
  },
  cardTitle: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  active: { marginTop: 12, fontWeight: "700" },
  cta: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: { color: "#0F172A", fontWeight: "700" },
  secondary: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
});
