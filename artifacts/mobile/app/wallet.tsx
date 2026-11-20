/**
 * Promo Account (native) — delivery code only.
 * No FM Wallet balances, Card FM money UI, top-ups, send/receive, or history.
 * Old /wallet deep links land here so they cannot open wallet money flows.
 *
 * Delivery code source: `accountNumber` from GET /wallet/balance
 * (persistent FM account number used for agent/delivery pickup — not referral,
 * coupon, or per-order verificationCode / delivery PIN).
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { fetchDeliveryCode } from "@/lib/walletApi";

export default function PromoAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const code = await fetchDeliveryCode({ token });
        setDeliveryCode(code);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load delivery code");
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

  const onShare = async () => {
    if (!deliveryCode) return;
    try {
      await Share.share({ message: deliveryCode, title: "Delivery code" });
    } catch {
      Alert.alert("Share failed", "Could not share the delivery code.");
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Promo Account</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 32,
          paddingTop: 8,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load("refresh")}
            tintColor="#F97316"
          />
        }
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading && !deliveryCode ? (
          <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Delivery code</Text>
            <Text style={styles.code} selectable>
              {deliveryCode ?? "—"}
            </Text>
            <Text style={styles.hint}>
              Show this code for delivery pickup. Wallet balance, top-ups, and
              money transfers are not available in the Android app.
            </Text>
            <Pressable
              style={[styles.copyBtn, !deliveryCode && styles.copyBtnDisabled]}
              onPress={() => void onShare()}
              disabled={!deliveryCode}
            >
              <Feather name="share-2" size={16} color="#fff" />
              <Text style={styles.copyBtnText}>Share code</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
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
  error: { color: "#B91C1C", marginBottom: 12, fontWeight: "600" },
  card: {
    backgroundColor: "#0F172A",
    borderRadius: 18,
    padding: 24,
    marginTop: 8,
  },
  cardLabel: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  code: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    marginTop: 12,
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
  },
  hint: {
    color: "#CBD5E1",
    marginTop: 14,
    fontSize: 13,
    lineHeight: 19,
  },
  copyBtn: {
    marginTop: 20,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F97316",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  copyBtnDisabled: { opacity: 0.5 },
  copyBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
