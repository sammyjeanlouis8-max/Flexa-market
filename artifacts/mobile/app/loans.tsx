/**
 * Business loans — GET /api/loans/eligibility, POST /api/loans/apply, GET /api/loans/my
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
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, money } from "@/lib/request";

type Eligibility = {
  eligible?: boolean;
  countryEligible?: boolean;
  country?: string;
  daysOnPlatform?: number;
  daysRemaining?: number;
  minDays?: number;
  interestRate?: number;
  minAmount?: number;
  maxAmount?: number;
  listingEligible?: boolean;
  activeListingCount?: number;
  minListings?: number;
  existingApplication?: {
    id: number;
    status: string;
    amountRequested?: number;
    termMonths?: number;
    reviewerNote?: string | null;
    totalRepaymentUsd?: number;
    amountPaidUsd?: number;
  } | null;
  metrics?: Record<string, number>;
};

export default function LoansScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<Eligibility | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [amount, setAmount] = useState("100");
  const [term, setTerm] = useState("3");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        setData(await apiRequest<Eligibility>("/loans/eligibility", { token }));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load loan eligibility");
        setData(null);
      } finally {
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
      if (token) void load();
    }, [authLoading, token, router, load]),
  );

  const apply = async () => {
    if (!token) return;
    const amountRequested = Number(amount);
    const termMonths = Number(term);
    if (!Number.isFinite(amountRequested) || amountRequested <= 0) {
      Alert.alert("Invalid amount");
      return;
    }
    setBusy(true);
    try {
      await apiRequest("/loans/apply", {
        token,
        method: "POST",
        body: { amountRequested, termMonths },
      });
      Alert.alert("Submitted", "Your loan application was sent for review.");
      await load();
    } catch (e) {
      Alert.alert("Application failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Business Loans" showBack />
      {!data && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={colors.flexaGreen} />
          }
        >
          {error ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retry}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={[styles.card, { borderColor: data?.eligible ? colors.flexaGreen : "#F59E0B" }]}>
            <Text style={styles.badge}>{data?.eligible ? "Eligible" : "Not eligible yet"}</Text>
            <Text style={styles.hero}>Seller working capital</Text>
            <Text style={styles.sub}>
              Interest ~{((data?.interestRate ?? 0) * 100).toFixed(0)}% ·{" "}
              {money(data?.minAmount)}–{money(data?.maxAmount)}
            </Text>
            <Text style={styles.line}>
              Country: {data?.country || "—"} {data?.countryEligible ? "✓" : "(not supported)"}
            </Text>
            <Text style={styles.line}>
              Account age: {data?.daysOnPlatform ?? 0}/{data?.minDays ?? 90} days
              {(data?.daysRemaining ?? 0) > 0 ? ` (${data?.daysRemaining} left)` : ""}
            </Text>
            <Text style={styles.line}>
              Active listings: {data?.activeListingCount ?? 0}/{data?.minListings ?? 10}
            </Text>
          </View>

          {data?.existingApplication ? (
            <View style={styles.card}>
              <Text style={styles.section}>Current application</Text>
              <Text style={styles.line}>Status: {data.existingApplication.status}</Text>
              <Text style={styles.line}>
                Amount: {money(data.existingApplication.amountRequested)} ·{" "}
                {data.existingApplication.termMonths} mo
              </Text>
              {data.existingApplication.reviewerNote ? (
                <Text style={styles.note}>{data.existingApplication.reviewerNote}</Text>
              ) : null}
              {data.existingApplication.totalRepaymentUsd != null ? (
                <Text style={styles.line}>
                  Repaid {money(data.existingApplication.amountPaidUsd)} /{" "}
                  {money(data.existingApplication.totalRepaymentUsd)}
                </Text>
              ) : null}
            </View>
          ) : null}

          {data?.eligible && !data.existingApplication ? (
            <View style={styles.card}>
              <Text style={styles.section}>Apply</Text>
              <Text style={styles.label}>Amount (USD)</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />
              <Text style={styles.label}>Term (months)</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={term}
                onChangeText={setTerm}
              />
              <Pressable
                style={[styles.btn, busy && { opacity: 0.6 }]}
                onPress={() => void apply()}
                disabled={busy}
              >
                <Text style={styles.btnText}>{busy ? "Submitting…" : "Submit application"}</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable style={styles.link} onPress={() => router.push("/credit-score")}>
            <Text style={styles.linkText}>View credit score</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { backgroundColor: "#FEF2F2", padding: 10, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: "#B91C1C" },
  retry: { color: colors.flexaGreen, fontWeight: "700", marginTop: 4 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 12,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#ECFDF5",
    color: colors.flexaGreen,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: "800",
    fontSize: 12,
    marginBottom: 8,
  },
  hero: { fontSize: 18, fontWeight: "800", color: colors.light.text },
  sub: { color: "#64748B", marginTop: 4, marginBottom: 10 },
  line: { color: "#334155", marginTop: 4, fontSize: 13 },
  note: { marginTop: 8, color: "#92400E", backgroundColor: "#FFFBEB", padding: 8, borderRadius: 8 },
  section: { fontWeight: "800", fontSize: 15, marginBottom: 8, color: colors.light.text },
  label: { fontSize: 12, fontWeight: "700", color: "#94A3B8", marginBottom: 4, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: colors.light.background,
    color: colors.light.text,
  },
  btn: {
    marginTop: 14,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  link: { marginTop: 8, alignSelf: "flex-start" },
  linkText: { color: colors.flexaGreen, fontWeight: "800" },
});
