/**
 * Native Boost campaign UI — wallet path when allowed.
 * Play Store digital-purchase guard may block initiate; message shown honestly.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { fetchListing } from "@/lib/api";
import {
  ApiError,
  estimateBoost,
  fetchBoostMethods,
  initiateBoostWallet,
  type BoostEstimate,
  type BoostPlan,
} from "@/lib/boostApi";
import { formatMoney } from "@/lib/orderUi";

export default function BoostScreen() {
  const { listingId: listingIdParam } = useLocalSearchParams<{ listingId?: string }>();
  const listingId = Number(listingIdParam);
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();

  const [plans, setPlans] = useState<BoostPlan[]>([]);
  const [allowedMethods, setAllowedMethods] = useState<string[]>([]);
  const [plan, setPlan] = useState<string>("");
  const [budget, setBudget] = useState("10");
  const [estimate, setEstimate] = useState<BoostEstimate | null>(null);
  const [listingTitle, setListingTitle] = useState<string>("");
  const [listingThumb, setListingThumb] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [blockedNote, setBlockedNote] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) router.replace("/auth/login");
    }, [authLoading, token, router]),
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const methods = await fetchBoostMethods({ token });
        if (cancelled) return;
        setPlans(methods.plans || []);
        setAllowedMethods(methods.allowedMethods || []);
        const first = methods.plans?.[0];
        if (first) {
          setPlan(first.id);
          setBudget(String(first.basePrice));
        }
        if (listingId) {
          const listing = await fetchListing(listingId, { token });
          if (!cancelled) {
            setListingTitle(listing.title);
            setListingThumb(listing.images?.[0] ?? null);
          }
        }
      } catch (e) {
        if (!cancelled) {
          Alert.alert("Boost unavailable", e instanceof Error ? e.message : "Try again");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, listingId]);

  useEffect(() => {
    if (!token || !plan) return;
    const budgetNum = Number(budget);
    if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void estimateBoost({ plan, budget: budgetNum }, { token })
        .then((e) => {
          if (!cancelled) setEstimate(e);
        })
        .catch(() => {
          if (!cancelled) setEstimate(null);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [token, plan, budget]);

  const walletAllowed = useMemo(
    () => allowedMethods.includes("wallet"),
    [allowedMethods],
  );

  const onLaunch = async () => {
    if (!token) return;
    if (!listingId) {
      Alert.alert("Pick a listing", "Open Boost from one of your listings.");
      router.push("/my-listings");
      return;
    }
    const budgetNum = Number(budget);
    if (!plan || !Number.isFinite(budgetNum) || budgetNum <= 0) {
      Alert.alert("Budget required", "Enter a valid boost budget.");
      return;
    }
    if (!walletAllowed) {
      Alert.alert(
        "Wallet boost unavailable",
        "Wallet is not an allowed boost payment method for your country. Card/MonCash checkout is blocked in the Android app (Google Play digital goods policy).",
      );
      return;
    }
    setBusy(true);
    setBlockedNote(null);
    try {
      const result = await initiateBoostWallet(
        listingId,
        { plan, budget: budgetNum, paymentMethod: "wallet" },
        { token },
      );
      Alert.alert(
        "Boost activated",
        result.activated
          ? `Campaign live until ${result.expiresAt || "the plan end date"}.`
          : "Boost payment recorded.",
        [{ text: "OK", onPress: () => router.replace("/my-boosts") }],
      );
    } catch (e) {
      if (e instanceof ApiError && e.code === "ANDROID_DIGITAL_PURCHASE_UNAVAILABLE") {
        setBlockedNote(
          "Paid boosts are unavailable in the Android app under Google Play digital goods rules. Use flexamarket.com on the web, or wait for Play Billing support.",
        );
      } else if (e instanceof ApiError && e.code === "INSUFFICIENT_WALLET") {
        Alert.alert(
          "Insufficient wallet",
          `Need $${Number(e.data?.requiredUsd ?? budgetNum).toFixed(2)}. Available: $${Number(e.data?.totalBalance ?? 0).toFixed(2)}.`,
        );
      } else {
        Alert.alert("Boost failed", e instanceof Error ? e.message : "Try again");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Boost" showBrand={false} showBack showCart={false} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.pad}>
          {listingId ? (
            <View style={styles.listingCard}>
              {listingThumb ? (
                <Image source={{ uri: listingThumb }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Feather name="package" size={20} color="#94A3B8" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.listingTitle} numberOfLines={2}>
                  {listingTitle || `Listing #${listingId}`}
                </Text>
                <Text style={styles.hint}>Boost this listing in the marketplace feed</Text>
              </View>
            </View>
          ) : (
            <Pressable style={styles.pick} onPress={() => router.push("/my-listings")}>
              <Feather name="list" size={18} color={colors.flexaGreen} />
              <Text style={styles.pickText}>Choose a listing to boost</Text>
            </Pressable>
          )}

          <Text style={styles.label}>Plan</Text>
          <View style={styles.chipRow}>
            {plans.map((p) => (
              <Pressable
                key={p.id}
                style={[styles.chip, plan === p.id && styles.chipOn]}
                onPress={() => {
                  setPlan(p.id);
                  setBudget(String(p.basePrice));
                }}
              >
                <Text style={[styles.chipText, plan === p.id && styles.chipTextOn]}>
                  {p.id} · {p.days}d · ${p.basePrice}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Budget (USD)</Text>
          <TextInput
            style={styles.input}
            value={budget}
            onChangeText={setBudget}
            keyboardType="decimal-pad"
            placeholder="10"
            placeholderTextColor="#94A3B8"
          />

          {estimate ? (
            <View style={styles.estimate}>
              <Text style={styles.estimateTitle}>Estimate</Text>
              <Text style={styles.estimateLine}>
                Reach ~{estimate.estimatedReach.toLocaleString()} · {estimate.durationDays} days
              </Text>
              <Text style={styles.estimateLine}>
                Payable {formatMoney(estimate.amountPayable)}
              </Text>
              {estimate.estimateDisclaimer ? (
                <Text style={styles.disclaimer}>{estimate.estimateDisclaimer}</Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.noteBox}>
            <Feather name="info" size={16} color="#0369A1" />
            <Text style={styles.noteText}>
              Android app uses wallet when available. Card/MonCash digital checkout is blocked by
              Play policy. {walletAllowed ? "Wallet is allowed for your account country." : "Wallet is not listed for your country."}
            </Text>
          </View>

          {blockedNote ? (
            <View style={styles.blockBox}>
              <Text style={styles.blockText}>{blockedNote}</Text>
            </View>
          ) : null}

          <Pressable
            style={[styles.submit, busy && styles.submitDisabled]}
            disabled={busy}
            onPress={() => void onLaunch()}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Launch with wallet</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  pad: { padding: 16, paddingBottom: 48 },
  listingCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
    marginBottom: 8,
  },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: "#E2E8F0" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  listingTitle: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  hint: { marginTop: 4, fontSize: 12, color: "#64748B" },
  pick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    marginBottom: 8,
  },
  pickText: { fontWeight: "700", color: colors.flexaGreen },
  label: { marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: "700", color: "#334155" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  chipText: { fontSize: 12, fontWeight: "700", color: "#475569", textTransform: "capitalize" },
  chipTextOn: { color: "#fff" },
  input: {
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0F172A",
  },
  estimate: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  estimateTitle: { fontWeight: "800", color: "#0F172A", marginBottom: 6 },
  estimateLine: { color: "#334155", marginTop: 2 },
  disclaimer: { marginTop: 8, fontSize: 12, color: "#64748B" },
  noteBox: {
    marginTop: 16,
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#E0F2FE",
  },
  noteText: { flex: 1, fontSize: 13, color: "#0C4A6E", lineHeight: 18 },
  blockBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  blockText: { color: "#92400E", fontSize: 13, lineHeight: 18 },
  submit: {
    marginTop: 20,
    backgroundColor: colors.flexaGreen,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
