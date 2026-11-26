/**
 * Native Boost wizard — duration plans (visual). Paid purchase blocked on store apps.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { friendlyApiError, tr } from "@/i18n/nativeScreens";
import { fetchListing, type Listing } from "@/lib/api";
import { BOOST_PLANS, resolveBoostMediaUrl } from "@/lib/boostApi";
import { cleanListingImageUrls } from "@/lib/listingImages";
import colors from "@/constants/colors";

type PlanId = (typeof BOOST_PLANS)[number]["id"];

export default function BoostScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ listingId?: string }>();
  const listingId = Number(params.listingId ?? 0) || 0;
  const { token, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(Boolean(listingId));
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanId>("3day");

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (!listingId) return;
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          const row = await fetchListing(listingId, { token });
          if (!cancelled) {
            setListing(row);
            setError(null);
          }
        } catch (e) {
          if (!cancelled) {
            setError(friendlyApiError(e instanceof Error ? e.message : undefined, t) || t("common_loadFailed"));
            setListing(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [authLoading, token, listingId, router]),
  );

  const onPaidBlocked = () => {
    // Never call paid initiate on Android / iOS store builds.
    Alert.alert(t("boost_payBlockedTitle"), t("boost_payBlockedBody"));
  };

  if (!listingId) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8 }]} testID="boost-empty">
        <View style={styles.topBar}>
          <Pressable
            style={styles.back}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          >
            <Feather name="arrow-left" size={22} color="#0F172A" />
          </Pressable>
          <Text style={styles.title}>{t("boost_title")}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Feather name="zap" size={32} color="#F97316" />
          </View>
          <Text style={styles.emptyTitle}>{t("boost_chooseListing")}</Text>
          <Text style={styles.emptyDesc}>{t("boost_chooseListingHint")}</Text>
          <Pressable
            style={styles.cta}
            onPress={() => router.replace("/my-listings" as never)}
          >
            <Text style={styles.ctaText}>{t("boost_goListings")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const images = cleanListingImageUrls(listing?.images);
  const thumb = resolveBoostMediaUrl(images[0] ?? null);
  const selected = BOOST_PLANS.find((p) => p.id === plan) ?? BOOST_PLANS[1];

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]} testID="boost-wizard">
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/my-boosts"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>{t("boost_title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 28, paddingHorizontal: 16 }}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.listingCard}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.listingThumb} contentFit="cover" />
            ) : (
              <View style={[styles.listingThumb, styles.thumbFallback]}>
                <Feather name="image" size={22} color="#94A3B8" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.listingTitle} numberOfLines={2}>
                {listing?.title ?? `Listing #${listingId}`}
              </Text>
              <Text style={styles.listingSub}>#{listingId}</Text>
            </View>
          </View>

          <Text style={styles.section}>{t("boost_duration")}</Text>
          <Text style={styles.sectionHint}>{t("boost_payBlockedBody")}</Text>

          <View style={styles.plans}>
            {BOOST_PLANS.map((p) => {
              const on = plan === p.id;
              return (
                <Pressable
                  key={p.id}
                  style={[styles.plan, on && styles.planOn]}
                  onPress={() => setPlan(p.id)}
                  testID={`boost-plan-${p.id}`}
                >
                  {p.badge ? (
                    <View style={styles.planBadge}>
                      <Text style={styles.planBadgeText}>{p.badge}</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.planDays, on && styles.planDaysOn]}>{p.label}</Text>
                  <Text style={[styles.planPrice, on && styles.planPriceOn]}>
                    ${p.price.toFixed(2)}
                  </Text>
                  {on ? <Feather name="check-circle" size={18} color={colors.flexaGreen} /> : null}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>{t("boost_duration")}</Text>
            <Text style={styles.summaryValue}>
              {selected.label} · ${selected.price.toFixed(2)}
            </Text>
          </View>

          <Pressable style={styles.payBtn} onPress={onPaidBlocked} testID="boost-pay-cta">
            <Feather name="credit-card" size={18} color="#fff" />
            <Text style={styles.payBtnText}>
              {tr(t, "boost_continuePay", { amount: `$${selected.price.toFixed(2)}` })}
            </Text>
          </Pressable>
          <Text style={styles.policyNote}>{t("boost_payBlockedBody")}</Text>
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
    paddingHorizontal: 16,
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
  error: { color: "#B91C1C", marginBottom: 8, fontWeight: "600" },
  listingCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 18,
  },
  listingThumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
  },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  listingTitle: { fontWeight: "800", color: "#0F172A", fontSize: 15 },
  listingSub: { marginTop: 4, color: "#94A3B8", fontSize: 12, fontWeight: "600" },
  section: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  sectionHint: {
    marginTop: 4,
    marginBottom: 12,
    color: "#64748B",
    fontSize: 13,
    lineHeight: 18,
  },
  plans: { gap: 10 },
  plan: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  planOn: {
    borderColor: colors.flexaGreen,
    backgroundColor: "#ECFDF5",
  },
  planBadge: {
    position: "absolute",
    top: -8,
    right: 12,
    backgroundColor: "#F97316",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  planBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  planDays: { flex: 1, fontSize: 16, fontWeight: "800", color: "#0F172A" },
  planDaysOn: { color: colors.flexaGreenDeep },
  planPrice: { fontSize: 18, fontWeight: "900", color: "#64748B" },
  planPriceOn: { color: colors.flexaGreen },
  summary: {
    marginTop: 18,
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  summaryLabel: { color: "#9A3412", fontSize: 12, fontWeight: "700" },
  summaryValue: { marginTop: 2, color: "#0F172A", fontSize: 16, fontWeight: "900" },
  payBtn: {
    marginTop: 16,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#F97316",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  payBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  policyNote: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
  },
  empty: { alignItems: "center", paddingHorizontal: 28, paddingTop: 48 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#FFF7ED",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  emptyDesc: {
    marginTop: 8,
    textAlign: "center",
    color: "#64748B",
    fontSize: 14,
    lineHeight: 20,
  },
  cta: {
    marginTop: 20,
    backgroundColor: colors.flexaGreen,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
  },
  ctaText: { color: "#fff", fontWeight: "800" },
});
