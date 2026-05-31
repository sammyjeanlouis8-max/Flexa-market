import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Linking, Platform, Pressable,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

const PLANS = [
  { id: "1day", label: "1 Jou", price: 2.99, views: "~2,000+", perks: ["Seksyon Featured", "Rechèch Prioritè"] },
  { id: "3days", label: "3 Jou", price: 6.99, views: "~10,000+", perks: ["Tout 1 jou +", "Badge mete aksan", "~10k+ vye"] },
  { id: "7days", label: "7 Jou", price: 12.99, views: "~60,000+", perks: ["Tout 3 jou +", "Tèt rechèch tout semèn", "~60k+ vye"], popular: true },
];

const METHODS = [
  { id: "wallet", label: "FM Wallet", icon: "credit-card", color: "#6366F1" },
  { id: "moncash", label: "MonCash", icon: "smartphone", color: "#E5B800" },
  { id: "card", label: "Kat Kredi (Stripe)", icon: "credit-card", color: "#3B82F6" },
];

export default function BoostScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [selectedPlan, setSelectedPlan] = useState("7days");
  const [selectedMethod, setSelectedMethod] = useState("wallet");
  const [customBudget, setCustomBudget] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<{ minReach: number; maxReach: number } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const [wallet, setWallet] = useState<{ balanceUsd: number; promoBalance: number } | null>(null);

  const plan = PLANS.find((p) => p.id === selectedPlan)!;
  const effectivePrice = customBudget ?? plan.price;

  useEffect(() => {
    request<any>("/wallet").then((d) => setWallet(d)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!listingId) return;
    setEstimating(true);
    request<any>("/boost/estimate", {
      method: "POST",
      body: JSON.stringify({ listingId: Number(listingId), plan: selectedPlan, budget: effectivePrice }),
    }).then((d) => setEstimate(d)).catch(() => {}).finally(() => setEstimating(false));
  }, [selectedPlan, effectivePrice, listingId]);

  const handleBoost = async () => {
    if (!listingId) { Alert.alert("Erè", "Listing ID manke."); return; }
    setBoosting(true);
    try {
      if (selectedMethod === "card") {
        const data = await request<{ sessionUrl: string }>(`/listings/${listingId}/boost/stripe-checkout`, {
          method: "POST",
          body: JSON.stringify({ plan: selectedPlan, budget: effectivePrice }),
        });
        if (data?.sessionUrl) { await Linking.openURL(data.sessionUrl); }
      } else if (selectedMethod === "wallet") {
        await request(`/listings/${listingId}/boost/initiate`, {
          method: "POST",
          body: JSON.stringify({ plan: selectedPlan, budget: effectivePrice, paymentMethod: "wallet" }),
        });
        Alert.alert("🚀 Boost Aktive!", `Lis ou ap parèt bay ${estimate?.maxReach?.toLocaleString() ?? "plizyè"} moun.`, [
          { text: "OK", onPress: () => router.back() }
        ]);
      } else {
        await request(`/listings/${listingId}/boost/initiate`, {
          method: "POST",
          body: JSON.stringify({ plan: selectedPlan, budget: effectivePrice, paymentMethod: selectedMethod }),
        });
        Alert.alert("✅ Soumèt!", "Admin ap verifye peman ou.", [{ text: "OK", onPress: () => router.back() }]);
      }
    } catch (e: any) {
      Alert.alert("Erè Boost", e?.message ?? "Erè enkoni.");
    } finally { setBoosting(false); }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 10, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>🚀 Boost Lis ou</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100, gap: 20 }}>
        {/* Hero */}
        <LinearGradient colors={["#4F46E5", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
          <Feather name="trending-up" size={32} color="#fff" />
          <Text style={styles.heroTitle}>Vann plis vit!</Text>
          <Text style={styles.heroSub}>Ale devan tout lis yo epi jwenn plis moun wè pwodui ou.</Text>
          {estimate && (
            <View style={styles.estimateRow}>
              <Feather name="eye" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={styles.estimateText}>
                {estimating ? "Kalkile..." : `${estimate.minReach.toLocaleString()} – ${estimate.maxReach.toLocaleString()} vye estime`}
              </Text>
            </View>
          )}
        </LinearGradient>

        {/* Plans */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Chwazi Plan</Text>
        {PLANS.map((p) => {
          const active = selectedPlan === p.id;
          return (
            <TouchableOpacity key={p.id} onPress={() => setSelectedPlan(p.id)} activeOpacity={0.85}>
              <View style={[styles.planCard, { backgroundColor: colors.card, borderColor: active ? colors.primary : colors.border, borderWidth: active ? 2 : 1 }]}>
                {p.popular && (
                  <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.popularText}>⭐ PI POPILÈ</Text>
                  </View>
                )}
                <View style={styles.planRow}>
                  <View style={[styles.planRadio, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }]}>
                    {active && <View style={styles.planRadioInner} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planLabel, { color: colors.foreground }]}>{p.label}</Text>
                    <Text style={[styles.planViews, { color: colors.mutedForeground }]}>{p.views} vye estime</Text>
                  </View>
                  <Text style={[styles.planPrice, { color: colors.primary }]}>${p.price}</Text>
                </View>
                <View style={styles.perksRow}>
                  {p.perks.map((perk) => (
                    <View key={perk} style={styles.perkItem}>
                      <Feather name="check" size={12} color="#22C55E" />
                      <Text style={[styles.perkText, { color: colors.mutedForeground }]}>{perk}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Wallet Balance */}
        {wallet && (
          <View style={[styles.walletInfo, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="credit-card" size={16} color={colors.primary} />
            <Text style={[styles.walletInfoText, { color: colors.foreground }]}>
              Balans FM Wallet: <Text style={{ color: "#22C55E", fontFamily: "Inter_700Bold" }}>${wallet.balanceUsd.toFixed(2)}</Text>
              {wallet.promoBalance > 0 && <Text style={{ color: "#F59E0B" }}>  +${wallet.promoBalance.toFixed(2)} promo</Text>}
            </Text>
          </View>
        )}

        {/* Payment Method */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Metòd Peman</Text>
        {METHODS.map((m) => {
          const active = selectedMethod === m.id;
          return (
            <TouchableOpacity key={m.id} onPress={() => setSelectedMethod(m.id)}
              style={[styles.methodCard, { backgroundColor: colors.card, borderColor: active ? m.color : colors.border, borderWidth: active ? 2 : 1 }]}>
              <View style={[styles.methodIcon, { backgroundColor: m.color + "22" }]}>
                <Feather name={m.icon as any} size={18} color={m.color} />
              </View>
              <Text style={[styles.methodLabel, { color: colors.foreground }]}>{m.label}</Text>
              {active && <Feather name="check-circle" size={18} color={m.color} />}
            </TouchableOpacity>
          );
        })}

        {/* Summary */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Plan</Text>
            <Text style={[styles.summaryVal, { color: colors.foreground }]}>{plan.label}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Metòd</Text>
            <Text style={[styles.summaryVal, { color: colors.foreground }]}>{METHODS.find((m) => m.id === selectedMethod)?.label}</Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={[styles.totalLabel, { color: colors.foreground }]}>Total</Text>
            <Text style={[styles.totalVal, { color: colors.primary }]}>${effectivePrice.toFixed(2)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* CTA */}
      <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
        <Pressable style={[styles.boostBtn, { opacity: boosting ? 0.7 : 1 }]}
          onPress={handleBoost} disabled={boosting}>
          <LinearGradient colors={["#4F46E5", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.boostBtnGradient}>
            {boosting
              ? <ActivityIndicator color="#fff" />
              : <><Feather name="zap" size={18} color="#fff" /><Text style={styles.boostBtnText}>Boost pou ${effectivePrice.toFixed(2)}</Text></>}
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  heroCard: { borderRadius: 20, padding: 24, alignItems: "center", gap: 8 },
  heroTitle: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold" },
  heroSub: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  estimateRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  estimateText: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontFamily: "Inter_500Medium" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  planCard: { borderRadius: 14, padding: 14, gap: 10, position: "relative", overflow: "hidden" },
  popularBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginBottom: 4 },
  popularText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  planRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  planRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  planRadioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#fff" },
  planLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  planViews: { fontSize: 12, fontFamily: "Inter_400Regular" },
  planPrice: { fontSize: 20, fontFamily: "Inter_700Bold" },
  perksRow: { gap: 4 },
  perkItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  perkText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  walletInfo: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  walletInfoText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  methodCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, padding: 14 },
  methodIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  methodLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  summaryCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  summaryVal: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  summaryTotal: { borderTopWidth: 1, borderTopColor: "#0002", paddingTop: 10, marginTop: 4 },
  totalLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  totalVal: { fontSize: 20, fontFamily: "Inter_700Bold" },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, borderTopWidth: 1 },
  boostBtn: { borderRadius: 14, overflow: "hidden" },
  boostBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 52 },
  boostBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
