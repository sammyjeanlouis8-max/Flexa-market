import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import {
  fetchMySubscription,
  fetchSubscriptionPlans,
  type MySubscription,
  type SubscriptionPlan,
} from "@/lib/subscriptionApi";

export default function SubscriptionScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [mine, setMine] = useState<MySubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await fetchSubscriptionPlans();
        if (!cancelled) setPlans(p);
        if (token) {
          const m = await fetchMySubscription({ token });
          if (!cancelled) setMine(m);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <View style={styles.root}>
      <AppHeader title="Subscription" showBrand={false} showBack />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.flexaGreen} />
      ) : error ? (
        <Text style={styles.msg}>{error}</Text>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          ListHeaderComponent={
            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>
                Current: {mine?.planName || mine?.plan || (token ? "Free" : "Guest")}
              </Text>
              <Text style={styles.bannerMeta}>
                In-app Play Billing purchases may be unavailable on Android; manage paid plans on
                the website or with wallet where supported.
              </Text>
              {!token ? (
                <Pressable style={styles.btn} onPress={() => router.push("/auth/login")}>
                  <Text style={styles.btnText}>Log in</Text>
                </Pressable>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.title}>{item.name}</Text>
              <Text style={styles.price}>${Number(item.priceUsd || 0).toFixed(2)}/mo</Text>
              <Text style={styles.meta}>Tier {item.tier}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  banner: {
    backgroundColor: "#F0FDF4",
    borderRadius: 14,
    padding: 14,
    gap: 8,
    marginBottom: 8,
  },
  bannerTitle: { fontWeight: "800", color: colors.flexaGreen, fontSize: 16 },
  bannerMeta: { color: "#475569", fontSize: 13, lineHeight: 19 },
  card: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, padding: 14, gap: 4 },
  title: { fontWeight: "800", color: "#0F172A", fontSize: 16 },
  price: { fontWeight: "800", color: colors.flexaOrange, fontSize: 18 },
  meta: { color: "#64748B" },
  msg: { textAlign: "center", color: "#64748B", marginTop: 24 },
  btn: { backgroundColor: colors.flexaGreen, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  btnText: { color: "#FFF", fontWeight: "800" },
});
