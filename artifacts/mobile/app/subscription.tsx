/**
 * Native Subscription plans — GET /api/subscription/plans + /my.
 * Paid plans use FM Wallet (`/subscription/wallet-pay`) — Android digital purchases unblocked.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { formatMoney } from "@/lib/orderUi";
import {
  fetchMySubscription,
  fetchSubscriptionPlans,
  paySubscriptionWithWallet,
  type MySubscription,
  type SubscriptionPlan,
} from "@/lib/subscriptionApi";

const FEATURE_LABELS: Record<string, string> = {
  "subscription.feature.maxListings": "Listing limit",
  "subscription.feature.unlimitedListings": "Unlimited listings",
  "subscription.feature.sellerProfile": "Seller profile",
  "subscription.feature.messaging": "Messaging",
  "subscription.feature.basicStats": "Basic stats",
  "subscription.feature.videoListings": "Video listings",
  "subscription.feature.superiorVisibility": "Superior visibility",
  "subscription.feature.categoryPriority": "Category priority",
  "subscription.feature.vipBadge": "VIP badge",
  "subscription.feature.prioritySupport": "Priority support",
};

export default function SubscriptionScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [mine, setMine] = useState<MySubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const [p, m] = await Promise.all([
          fetchSubscriptionPlans(),
          token ? fetchMySubscription({ token }) : Promise.resolve(null),
        ]);
        setPlans(p);
        setMine(m);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load plans");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load("initial");
    }, [authLoading, token, router, load]),
  );

  const onPurchaseAttempt = (plan: SubscriptionPlan) => {
    if (plan.id === "basic" || plan.priceUsd <= 0) {
      Alert.alert("Basic plan", "The Basic plan is free and already available.");
      return;
    }
    if (!token) {
      router.replace("/auth/login");
      return;
    }
    Alert.alert(
      `Subscribe — ${plan.name}`,
      `Pay ${formatMoney(plan.priceUsd)}/mo from your FM Wallet?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Pay with wallet",
          onPress: () => {
            void (async () => {
              setPaying(true);
              try {
                await paySubscriptionWithWallet(plan.id, { token });
                await load("refresh");
                Alert.alert("Subscribed", `${plan.name} is now active.`);
              } catch (e) {
                Alert.alert(
                  "Payment failed",
                  e instanceof Error ? e.message : "Try again or top up your wallet.",
                );
              } finally {
                setPaying(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Subscription" showBrand={false} showBack showCart={false} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.pad}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.flexaGreen}
            />
          }
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {mine ? (
            <View style={styles.current}>
              <Text style={styles.currentLabel}>Current plan</Text>
              <Text style={styles.currentName}>{mine.planName}</Text>
              <Text style={styles.currentMeta}>
                Status: {mine.status}
                {mine.expiresAt
                  ? ` · expires ${new Date(mine.expiresAt).toLocaleDateString()}`
                  : ""}
                {mine.isExpired ? " · expired" : ""}
              </Text>
            </View>
          ) : null}

          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Paid plans debit your FM Wallet instantly. Top up the wallet first if balance is low.
            </Text>
          </View>
          {paying ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.flexaGreen} />
            </View>
          ) : null}

          {plans.map((plan) => {
            const active = mine?.plan === plan.id && !mine.isExpired;
            return (
              <View key={plan.id} style={[styles.card, active && styles.cardActive]}>
                <View style={styles.cardHead}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planPrice}>
                    {plan.priceUsd > 0 ? `${formatMoney(plan.priceUsd)}/mo` : "Free"}
                  </Text>
                </View>
                {(plan.features || []).map((f, i) => (
                  <Text key={`${plan.id}-${i}`} style={styles.feature}>
                    •{" "}
                    {FEATURE_LABELS[f.key] || f.key}
                    {f.count != null ? ` (${f.count})` : ""}
                  </Text>
                ))}
                <Pressable
                  style={[styles.cta, active && styles.ctaActive]}
                  onPress={() => onPurchaseAttempt(plan)}
                >
                  <Text style={styles.ctaText}>
                    {active ? "Current plan" : plan.priceUsd > 0 ? "Subscribe" : "Included"}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  pad: { padding: 16, paddingBottom: 48 },
  error: { color: "#B91C1C", marginBottom: 12 },
  current: {
    backgroundColor: colors.flexaGreen,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  currentLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" },
  currentName: { marginTop: 4, color: "#fff", fontSize: 22, fontWeight: "800" },
  currentMeta: { marginTop: 6, color: "rgba(255,255,255,0.9)", fontSize: 12 },
  notice: {
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  noticeText: { color: "#92400E", fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 12,
  },
  cardActive: { borderColor: colors.flexaGreen, borderWidth: 2 },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  planName: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  planPrice: { fontSize: 15, fontWeight: "800", color: colors.flexaGreen },
  feature: { marginTop: 4, fontSize: 13, color: "#334155" },
  cta: {
    marginTop: 14,
    backgroundColor: colors.flexaGreen,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  ctaActive: { backgroundColor: "#94A3B8" },
  ctaText: { color: "#fff", fontWeight: "800" },
});
