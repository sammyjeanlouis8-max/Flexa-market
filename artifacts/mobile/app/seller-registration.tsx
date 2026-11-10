/**
 * Become a Seller — native onboarding hub.
 * Does not auto-approve; KYC and payouts use real backend screens.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchKycStatus, type KycStatus } from "@/lib/kycApi";
import { fetchPayoutAccount } from "@/lib/sellerApi";

type StepState = "todo" | "pending" | "done" | "blocked";

export default function SellerRegistrationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [kyc, setKyc] = useState<KycStatus | null>(null);
  const [hasPayout, setHasPayout] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [k, payout] = await Promise.all([
        fetchKycStatus({ token }),
        fetchPayoutAccount({ token }).catch(() => null),
      ]);
      setKyc(k);
      const moncash = Boolean((payout as any)?.moncashPhone || (payout as any)?.moncash);
      const bank = Boolean((payout as any)?.bankAccountNumber || (payout as any)?.bank);
      setHasPayout(moncash || bank || Boolean((payout as any)?.cardMethod));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load seller status");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load();
    }, [authLoading, token, router, load]),
  );

  const kycState: StepState =
    kyc?.status === "approved"
      ? "done"
      : kyc?.status === "pending"
        ? "pending"
        : kyc?.status === "rejected"
          ? "blocked"
          : "todo";

  const steps: {
    key: string;
    title: string;
    hint: string;
    state: StepState;
    href: string;
  }[] = [
    {
      key: "profile",
      title: t("sellerRegProfile") || "Complete profile",
      hint: user?.name ? `Signed in as ${user.name}` : "Add your seller profile details",
      state: user?.name ? "done" : "todo",
      href: "/edit-profile",
    },
    {
      key: "kyc",
      title: t("sKyc") || "Identity verification (KYC)",
      hint:
        kycState === "done"
          ? "Approved"
          : kycState === "pending"
            ? "Pending admin review — not auto-approved"
            : kycState === "blocked"
              ? `Rejected${kyc?.rejectionReason ? `: ${kyc.rejectionReason}` : ""}`
              : "Upload ID + selfie for admin review",
      state: kycState,
      href: "/kyc",
    },
    {
      key: "payout",
      title: t("sellerRegPayout") || "Payout account",
      hint: hasPayout ? "Payout method configured" : "Add MonCash or bank details",
      state: hasPayout ? "done" : "todo",
      href: "/seller-earnings",
    },
    {
      key: "store",
      title: t("sellerRegStore") || "Store manager (optional)",
      hint: "Invite a helper for order readiness",
      state: "todo",
      href: "/store-manager",
    },
    {
      key: "listing",
      title: t("sellerRegListing") || "Publish a listing",
      hint: "Requires at least one product image; drafts save on device",
      state: "todo",
      href: "/(tabs)/sell",
    },
  ];

  const stateColor = (s: StepState) =>
    s === "done" ? "#15803D" : s === "pending" ? "#C2410C" : s === "blocked" ? "#B91C1C" : "#64748B";

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>{t("sellerRegTitle") || "Become a seller"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.note}>
            {t("sellerRegNote") ||
              "Seller approval follows Flexa Market verification rules. KYC is reviewed by admins and is never auto-approved in the app."}
          </Text>
          {steps.map((step) => (
            <Pressable
              key={step.key}
              style={styles.card}
              onPress={() => router.push(step.href as any)}
              testID={`seller-reg-${step.key}`}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.cardTitle}>{step.title}</Text>
                <Text style={[styles.meta, { color: stateColor(step.state) }]}>{step.hint}</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#94A3B8" />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  note: { color: "#64748B", fontSize: 13, lineHeight: 18, marginBottom: 12 },
  error: { color: "#B91C1C", fontWeight: "600", marginBottom: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  meta: { fontSize: 12 },
});
