/**
 * Native Subscription — plans + status (read / cancel).
 * Purchases blocked on Android & iOS apps (store digital goods policy), same spirit as wallet top-up.
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
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import colors from "@/constants/colors";
import {
  cancelSubscription,
  featureLabel,
  fetchMySubscription,
  fetchSubscriptionPlans,
  fmtSubDate,
  uncancelSubscription,
  type MySubscription,
  type SubscriptionPlan,
} from "@/lib/subscriptionApi";

type PlanColors = {
  border: string;
  activeBorder: string;
  accentLight: string;
  iconColor: string;
  badgeBg: string;
  badgeText: string;
  btnBg: string;
  dot: string;
};

const PLAN_COLORS: Record<string, PlanColors> = {
  basic: {
    border: "#E2E8F0",
    activeBorder: "#94A3B8",
    accentLight: "#F8FAFC",
    iconColor: "#64748B",
    badgeBg: "#F1F5F9",
    badgeText: "#64748B",
    btnBg: "#0F172A",
    dot: "#94A3B8",
  },
  standard: {
    border: "#BFDBFE",
    activeBorder: "#60A5FA",
    accentLight: "#EFF6FF",
    iconColor: "#3B82F6",
    badgeBg: "#DBEAFE",
    badgeText: "#2563EB",
    btnBg: "#2563EB",
    dot: "#3B82F6",
  },
  premium: {
    border: "#A7F3D0",
    activeBorder: colors.flexaGreen,
    accentLight: "#ECFDF5",
    iconColor: colors.flexaGreen,
    badgeBg: "#D1FAE5",
    badgeText: colors.flexaGreen,
    btnBg: colors.flexaGreen,
    dot: colors.flexaGreen,
  },
  vip: {
    border: "#FCD34D",
    activeBorder: "#F59E0B",
    accentLight: "#FFFBEB",
    iconColor: "#F59E0B",
    badgeBg: "#FEF3C7",
    badgeText: "#D97706",
    btnBg: "#F97316",
    dot: "#F59E0B",
  },
};

const PLAN_ICONS: Record<string, React.ComponentProps<typeof Feather>["name"]> = {
  basic: "zap",
  standard: "star",
  premium: "trending-up",
  vip: "award",
};

function visLabel(tier: number): string {
  if (tier <= 0) return "Lòd nòmal";
  if (tier === 1) return "Lòd anwo";
  if (tier === 2) return "Lòd siperyè";
  return "Premye pozisyon";
}

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [mySub, setMySub] = useState<MySubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setLoadError(false);
      try {
        const plansPromise = fetchSubscriptionPlans();
        const myPromise = token
          ? fetchMySubscription({ token })
          : Promise.resolve(null);
        const [p, m] = await Promise.all([plansPromise, myPromise]);
        setPlans(p);
        setMySub(m);
      } catch {
        setLoadError(true);
        if (plans.length === 0) setPlans([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, plans.length],
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

  const onPurchaseBlocked = () => {
    Alert.alert(
      "Acha pa disponib",
      "Achte abònman nan aplikasyon an poko disponib (règleman Google Play / App Store pou pwodui dijital). Ou ka wè plan yo ak estati abònman ou isit la.",
    );
  };

  const onCancel = () => {
    if (!token || !mySub) return;
    Alert.alert(
      "Anile abònman?",
      `Abònman ou ap rete aktif jiska ${fmtSubDate(mySub.expiresAt)} — ou pap pèdi aksè kounye a.\n\nApre dat sa a, plan ou ap retounen sou Basic gratis.`,
      [
        { text: "Fèmen — Kenbe abònman", style: "cancel" },
        {
          text: "Wi, anile",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setActionBusy(true);
              try {
                const res = await cancelSubscription({ token });
                Alert.alert(
                  "Abònman anile",
                  `Ou gen aksè jiska ${fmtSubDate(res.accessUntil ?? mySub.expiresAt)}.`,
                );
                await load("refresh");
              } catch (e) {
                Alert.alert(
                  "Erè",
                  e instanceof Error ? e.message : "Pa t kapab anile abònman an.",
                );
              } finally {
                setActionBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  const onUncancel = () => {
    if (!token) return;
    Alert.alert(
      "Reaktive abònman?",
      "Abònman ou ap renouvle otomatikman nan fen peryòd la.",
      [
        { text: "Anile", style: "cancel" },
        {
          text: "Reaktive",
          onPress: () => {
            void (async () => {
              setActionBusy(true);
              try {
                await uncancelSubscription({ token });
                Alert.alert("Abònman reaktive!", "Abònman ou ap renouvle otomatikman.");
                await load("refresh");
              } catch (e) {
                Alert.alert(
                  "Pa disponib",
                  e instanceof Error
                    ? e.message
                    : "Reaktivasyon pa disponib nan aplikasyon an pou kounye a.",
                );
              } finally {
                setActionBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  const currentPlanId = mySub?.plan ?? "basic";
  const isExpired = mySub?.isExpired ?? false;
  const isGrace = mySub?.gracePeriodActive ?? false;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.topTitle}>Abònman FLEXA</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading && plans.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.flexaOrange} />
          <Text style={styles.loadingText}>Chajman plan yo…</Text>
        </View>
      ) : loadError && plans.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="alert-circle" size={36} color="#94A3B8" />
          <Text style={styles.errorTitle}>Nou pa t kapab chaje plan yo</Text>
          <Text style={styles.errorBody}>Verifye koneksyon ou epi eseye ankò.</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load("initial")}>
            <Feather name="refresh-cw" size={14} color="#0F172A" />
            <Text style={styles.retryText}>Eseye ankò</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.flexaOrange}
            />
          }
        >
          <View style={styles.hero}>
            <View style={styles.crownBadge}>
              <Feather name="award" size={12} color={colors.flexaGreen} />
              <Text style={styles.crownBadgeText}>Plan Abònman</Text>
            </View>
            <Text style={styles.h1}>Jere Abònman Ou</Text>
            <Text style={styles.subtitle}>
              Amelyore vizibilite lis ou yo epi deblouke fonksyon pou vann plis
            </Text>
          </View>

          {mySub && mySub.plan !== "basic" ? (
            <StatusBar
              mySub={mySub}
              isGrace={isGrace}
              isExpired={isExpired}
              actionBusy={actionBusy}
              onCancel={onCancel}
              onUncancel={onUncancel}
            />
          ) : null}

          {mySub && mySub.plan === "basic" && isExpired ? (
            <View style={styles.expiredBanner}>
              <Feather name="alert-circle" size={16} color="#DC2626" />
              <View style={{ flex: 1 }}>
                <Text style={styles.expiredTitle}>Abònman ou ekspire</Text>
                <Text style={styles.expiredBody}>
                  Lis ou yo kache. Chwazi yon plan anba pou rekòmanse vann.
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.policyNote}>
            <Feather name="info" size={14} color="#64748B" />
            <Text style={styles.policyText}>
              Acha abònman pa disponib nan aplikasyon mobil la (règleman magazen). Ou ka
              wè plan yo ak estati ou isit la.
            </Text>
          </View>

          {plans.map((plan) => {
            const c = PLAN_COLORS[plan.id] ?? PLAN_COLORS.basic;
            const icon = PLAN_ICONS[plan.id] ?? "zap";
            const isCurrent = currentPlanId === plan.id && !isExpired;
            const isPopular = plan.id === "premium";

            return (
              <View
                key={plan.id}
                style={[
                  styles.planCard,
                  {
                    borderColor: isCurrent ? c.activeBorder : c.border,
                    backgroundColor: isCurrent ? c.accentLight : "#FFFFFF",
                  },
                ]}
              >
                {(isPopular && !isCurrent) || isCurrent ? (
                  <View style={styles.planBadgeWrap}>
                    <View
                      style={[
                        styles.planBadge,
                        {
                          backgroundColor: isCurrent ? c.badgeBg : colors.flexaGreen,
                        },
                      ]}
                    >
                      {isCurrent ? (
                        <Feather name="check" size={10} color={c.badgeText} />
                      ) : null}
                      <Text
                        style={[
                          styles.planBadgeText,
                          { color: isCurrent ? c.badgeText : "#FFFFFF" },
                        ]}
                      >
                        {isCurrent ? "Plan Ou" : "Pi Popilè"}
                      </Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.planHead}>
                  <View style={styles.planNameRow}>
                    <Feather name={icon} size={16} color={c.iconColor} />
                    <Text style={styles.planName}>{plan.name}</Text>
                  </View>
                  {plan.featuredBadge ? (
                    <View style={[styles.vipChip, { backgroundColor: c.badgeBg }]}>
                      <Text style={[styles.vipChipText, { color: c.badgeText }]}>VIP</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.priceRow}>
                  {plan.priceUsd === 0 ? (
                    <Text style={styles.price}>Gratis</Text>
                  ) : (
                    <>
                      <Text style={styles.price}>${plan.priceUsd}</Text>
                      <Text style={styles.perMonth}>/mwa</Text>
                    </>
                  )}
                </View>
                {plan.priceUsd > 0 ? (
                  <Text style={styles.cancelAnytime}>Anile nenpòt ki lè</Text>
                ) : null}

                <View style={styles.divider} />

                <View style={styles.specs}>
                  <Text style={styles.spec}>
                    {plan.maxListings != null ? (
                      <>
                        <Text style={styles.specStrong}>{plan.maxListings}</Text> lis
                      </>
                    ) : (
                      <>
                        <Text style={styles.specStrong}>Ilimite</Text>
                      </>
                    )}
                  </Text>
                  <Text
                    style={[styles.spec, plan.videoEnabled && { color: "#16A34A" }]}
                  >
                    {plan.videoEnabled ? "Videyo" : "Pa gen videyo"}
                  </Text>
                  <Text style={styles.spec}>{visLabel(plan.tier)}</Text>
                </View>

                <View style={styles.features}>
                  {(plan.features ?? []).map((f, i) => (
                    <View key={`${f.key}-${i}`} style={styles.featureRow}>
                      <View style={[styles.dot, { backgroundColor: isCurrent ? c.dot : "#CBD5E1" }]} />
                      <Text style={styles.featureText}>{featureLabel(f)}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.ctaWrap}>
                  {plan.priceUsd === 0 ? (
                    <View style={styles.passiveCta}>
                      <Text style={styles.passiveCtaText}>
                        {isCurrent ? "Plan Aktif" : "Plan pa defò"}
                      </Text>
                    </View>
                  ) : isCurrent ? (
                    <View style={styles.passiveCta}>
                      <Text style={styles.passiveCtaText}>Plan Aktif</Text>
                    </View>
                  ) : (
                    <Pressable
                      style={[styles.buyBtn, { backgroundColor: c.btnBg }]}
                      onPress={onPurchaseBlocked}
                    >
                      <Text style={styles.buyBtnText}>Kòmanse</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function StatusBar({
  mySub,
  isGrace,
  isExpired,
  actionBusy,
  onCancel,
  onUncancel,
}: {
  mySub: MySubscription;
  isGrace: boolean;
  isExpired: boolean;
  actionBusy: boolean;
  onCancel: () => void;
  onUncancel: () => void;
}) {
  const c = PLAN_COLORS[mySub.plan] ?? PLAN_COLORS.basic;
  const icon = PLAN_ICONS[mySub.plan] ?? "award";

  let barBorder = "#E2E8F0";
  let barBg = "#FFFFFF";
  if (isGrace) {
    barBorder = "#FBBF24";
    barBg = "#FFFBEB";
  } else if (isExpired) {
    barBorder = "#F87171";
    barBg = "#FEF2F2";
  } else if (mySub.cancelAtPeriodEnd) {
    barBorder = "#FACC15";
    barBg = "#FEFCE8";
  }

  let pillBg = "#DCFCE7";
  let pillColor = "#15803D";
  let pillIcon: React.ComponentProps<typeof Feather>["name"] = "shield";
  let pillLabel = "Aktif";
  if (isGrace) {
    pillBg = "#FEF3C7";
    pillColor = "#B45309";
    pillIcon = "alert-triangle";
    pillLabel = "Peryòd Gras";
  } else if (isExpired) {
    pillBg = "#FEE2E2";
    pillColor = "#DC2626";
    pillIcon = "alert-circle";
    pillLabel = "Ekspire";
  } else if (mySub.cancelAtPeriodEnd) {
    pillBg = "#FEF9C3";
    pillColor = "#A16207";
    pillIcon = "slash";
    pillLabel = "Anile — aksè jiska ekspire";
  }

  return (
    <View style={[styles.statusBar, { borderColor: barBorder, backgroundColor: barBg }]}>
      <View style={styles.statusTop}>
        <Feather name={icon} size={16} color={c.iconColor} />
        <Text style={styles.statusPlan}>{mySub.planName}</Text>
        <Text style={styles.statusPrice}>
          ${mySub.priceUsd}/mwa · faktire chak mwa
        </Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: pillBg }]}>
        <Feather name={pillIcon} size={11} color={pillColor} />
        <Text style={[styles.statusPillText, { color: pillColor }]}>{pillLabel}</Text>
      </View>

      {mySub.nextBillingDate && !mySub.cancelAtPeriodEnd && !isExpired && !isGrace ? (
        <Text style={styles.statusDate}>
          Pwochen faktire:{" "}
          <Text style={styles.statusDateStrong}>{fmtSubDate(mySub.nextBillingDate)}</Text>
        </Text>
      ) : null}
      {mySub.expiresAt ? (
        <Text style={styles.statusDate}>
          {mySub.cancelAtPeriodEnd
            ? "Aksè jiska"
            : isExpired
              ? "Ekspire"
              : "Peryòd fini"}
          : <Text style={styles.statusDateStrong}> {fmtSubDate(mySub.expiresAt)}</Text>
        </Text>
      ) : null}

      {isGrace ? (
        <View style={styles.graceBox}>
          <Feather name="alert-triangle" size={14} color="#B45309" />
          <View style={{ flex: 1 }}>
            <Text style={styles.graceTitle}>Peman ou te echwe</Text>
            <Text style={styles.graceBody}>
              Aksè ou ap rete aktif jiska {fmtSubDate(mySub.graceUntil)}.
            </Text>
          </View>
        </View>
      ) : null}

      {!isExpired ? (
        <View style={styles.statusActions}>
          {mySub.cancelAtPeriodEnd ? (
            <Pressable
              style={styles.outlineBtn}
              disabled={actionBusy}
              onPress={onUncancel}
            >
              {actionBusy ? (
                <ActivityIndicator size="small" color="#0F172A" />
              ) : (
                <>
                  <Feather name="refresh-cw" size={12} color="#0F172A" />
                  <Text style={styles.outlineBtnText}>Reaktive abònman</Text>
                </>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[styles.outlineBtn, styles.cancelOutline]}
              disabled={actionBusy}
              onPress={onCancel}
            >
              <Feather name="x" size={12} color="#DC2626" />
              <Text style={[styles.outlineBtnText, { color: "#DC2626" }]}>
                Anile abònman
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
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
  topTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  centered: { alignItems: "center", justifyContent: "center", paddingTop: 64, gap: 10 },
  loadingText: { color: "#64748B", fontSize: 13 },
  errorTitle: { fontWeight: "700", color: "#0F172A", marginTop: 8 },
  errorBody: { color: "#64748B", fontSize: 13, textAlign: "center" },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  retryText: { fontWeight: "700", color: "#0F172A", fontSize: 13 },
  hero: { alignItems: "center", marginBottom: 18, marginTop: 4 },
  crownBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  crownBadgeText: { fontSize: 11, fontWeight: "700", color: colors.flexaGreen },
  h1: { fontSize: 20, fontWeight: "800", color: "#0F172A", marginBottom: 4 },
  subtitle: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 320,
  },
  statusBar: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    gap: 8,
  },
  statusTop: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  statusPlan: { fontWeight: "800", fontSize: 14, color: "#0F172A" },
  statusPrice: { fontSize: 12, color: "#64748B" },
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillText: { fontSize: 11, fontWeight: "700" },
  statusDate: { fontSize: 12, color: "#64748B" },
  statusDateStrong: { color: "#0F172A", fontWeight: "700" },
  graceBox: {
    flexDirection: "row",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#FDE68A",
    paddingTop: 8,
    marginTop: 2,
  },
  graceTitle: { fontSize: 12, fontWeight: "700", color: "#B45309" },
  graceBody: { fontSize: 11, color: "#D97706", marginTop: 2 },
  statusActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  cancelOutline: { borderColor: "#FECACA" },
  outlineBtnText: { fontSize: 12, fontWeight: "700", color: "#0F172A" },
  expiredBanner: {
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  expiredTitle: { fontWeight: "700", color: "#DC2626", fontSize: 13 },
  expiredBody: { color: "#64748B", fontSize: 12, marginTop: 2 },
  policyNote: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  policyText: { flex: 1, fontSize: 12, color: "#64748B", lineHeight: 17 },
  planCard: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    position: "relative",
  },
  planBadgeWrap: {
    position: "absolute",
    top: -10,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  planBadgeText: { fontSize: 10, fontWeight: "800" },
  planHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  planNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  planName: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  vipChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  vipChipText: { fontSize: 10, fontWeight: "900" },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 2, marginTop: 10 },
  price: { fontSize: 22, fontWeight: "800", color: "#0F172A" },
  perMonth: { fontSize: 12, color: "#64748B" },
  cancelAnytime: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E2E8F0",
    marginVertical: 12,
  },
  specs: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 10 },
  spec: { fontSize: 11, color: "#64748B" },
  specStrong: { fontWeight: "700", color: "#0F172A" },
  features: { gap: 8, marginBottom: 12 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  featureText: { flex: 1, fontSize: 12, color: "#64748B", lineHeight: 17 },
  ctaWrap: { marginTop: 4 },
  passiveCta: {
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  passiveCtaText: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  buyBtn: {
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  buyBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
});
