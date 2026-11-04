/**
 * Native iOS subscription screen — Apple IAP via RevenueCat only.
 * Stripe / wallet checkout is intentionally unavailable on iOS (App Store rules).
 * Default UI language: English.
 */
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { getApiBaseUrl } from "@/lib/config";
import { isStripeSubscriptionCheckoutBlockedOnIos } from "@/lib/revenuecat/client";
import {
  FALLBACK_PRICE_LABEL,
  type PaidPlanId,
} from "@/lib/revenuecat/products";

const PLANS: {
  id: PaidPlanId;
  title: string;
  features: string[];
}[] = [
  {
    id: "standard",
    title: "Standard",
    features: [
      "Up to 50 active listings",
      "Verified seller badge",
      "Sales statistics",
      "Priority support",
    ],
  },
  {
    id: "premium",
    title: "Premium",
    features: [
      "Unlimited listings",
      "Premium badge",
      "Video uploads for listings",
      "VIP support",
    ],
  },
];

type ServerSubscription = {
  plan?: string | null;
  expiresAt?: string | null;
  source?: string | null;
  billingProvider?: string | null;
};

export default function SubscriptionScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const iap = useRevenueCat();
  const [message, setMessage] = useState<string | null>(null);
  const [serverSub, setServerSub] = useState<ServerSubscription | null>(null);

  const stripeBlocked = isStripeSubscriptionCheckoutBlockedOnIos();

  const loadServerSubscription = useCallback(async () => {
    if (!token) {
      setServerSub(null);
      return;
    }
    try {
      const res = await fetch(`${getApiBaseUrl()}/subscription/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as ServerSubscription;
      setServerSub(data);
    } catch {
      /* non-fatal */
    }
  }, [token]);

  useEffect(() => {
    void loadServerSubscription();
  }, [loadServerSubscription]);

  if (Platform.OS !== "ios") {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
        edges={["top", "left", "right"]}
      >
        <View style={styles.body}>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: colors.mutedForeground }}>Back</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Subscription
          </Text>
          <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>
            Digital subscriptions on Android will use Google Play Billing via
            RevenueCat. On iOS, Apple In-App Purchase is required.
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
          <Text style={{ color: colors.mutedForeground }}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Flexa Market Premium
        </Text>
        <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>
          Subscribe with Apple In-App Purchase (RevenueCat). Stripe checkout is
          not offered on iOS for digital subscriptions.
        </Text>

        {stripeBlocked ? (
          <View style={[styles.banner, { borderColor: colors.border }]}>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
              Stripe and wallet subscription checkout are blocked on iOS (App
              Store rules).
            </Text>
          </View>
        ) : null}

        {serverSub?.plan ? (
          <View style={[styles.banner, { borderColor: colors.border }]}>
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>
              Server plan: {serverSub.plan}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              Provider: {serverSub.billingProvider || serverSub.source || "n/a"}
              {serverSub.expiresAt ? ` · expires ${serverSub.expiresAt}` : ""}
            </Text>
          </View>
        ) : null}

        {!token ? (
          <Pressable
            onPress={() => router.push("/auth/login")}
            style={[styles.cta, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.ctaText}>Sign in to subscribe</Text>
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
          const price = store?.priceString || FALLBACK_PRICE_LABEL[plan.id];
          const active =
            iap.activePlans.includes(plan.id) ||
            serverSub?.plan === plan.id;
          return (
            <View
              key={plan.id}
              style={[styles.card, { borderColor: colors.border }]}
            >
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                {plan.title} — {price}/mo
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
                  Active plan
                </Text>
              ) : (
                <Pressable
                  disabled={!token || !iap.identified || iap.busy || !store}
                  onPress={async () => {
                    setMessage(null);
                    const outcome = await iap.buy(plan.id);
                    if (outcome.status === "purchased") {
                      setMessage(
                        "Purchase succeeded. Your plan will activate via RevenueCat shortly.",
                      );
                      setTimeout(() => void loadServerSubscription(), 2000);
                    } else if (outcome.status === "cancelled") {
                      setMessage("Purchase cancelled.");
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
                      {store ? `Start · ${store.priceString}` : "Loading product…"}
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
              setMessage("Restore finished. Check your active plan above.");
              setTimeout(() => void loadServerSubscription(), 1500);
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Restore failed.");
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
            Manage Apple subscriptions
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
    gap: 4,
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
