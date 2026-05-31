import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Linking, Platform, Pressable,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

const PLANS = [
  {
    id: "basic", name: "Basic", price: 0, listings: "4 Lis",
    features: ["4 lis aktif", "Rechèch estanda", "Sipò imèl"],
    gradient: ["#374151", "#1F2937"] as [string, string],
    badge: null,
  },
  {
    id: "standard", name: "Standard", price: 15, listings: "Ilimite",
    features: ["Lis ilimite", "Foto video aktivé", "Rechèch priorite", "Sipò chat"],
    gradient: ["#1E40AF", "#3B82F6"] as [string, string],
    badge: "POPILÈ",
  },
  {
    id: "premium", name: "Premium", price: 30, listings: "Ilimite",
    features: ["Tout Standard +", "Analitik avanse", "Fèy vant personalize", "Sipò priorite"],
    gradient: ["#5B21B6", "#8B5CF6"] as [string, string],
    badge: "REKÒMANDE",
  },
  {
    id: "vip", name: "VIP", price: 50, listings: "Ilimite",
    features: ["Tout Premium +", "Badge Featured ⭐", "Mènajè kont dedye", "API Access"],
    gradient: ["#B45309", "#F59E0B"] as [string, string],
    badge: "VIP",
  },
];

interface Sub {
  planId: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd?: boolean;
}

export default function SubscriptionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [currentSub, setCurrentSub] = useState<Sub | null>(null);
  const [wallet, setWallet] = useState<{ balanceUsd: number; promoBalance: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [method, setMethod] = useState<"wallet" | "card">("wallet");

  useEffect(() => {
    Promise.all([
      request<Sub>("/subscription/my").then(setCurrentSub).catch(() => {}),
      request<any>("/wallet").then(setWallet).catch(() => {}),
      request<any[]>("/subscription/hidden-listings").then((d) => setHiddenCount(Array.isArray(d) ? d.length : 0)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async (planId: string, price: number) => {
    if (planId === "basic") return;
    setSubscribing(planId);
    try {
      if (method === "wallet") {
        await request("/subscription/wallet-pay", {
          method: "POST",
          body: JSON.stringify({ planId }),
        });
        const newSub = await request<Sub>("/subscription/my");
        setCurrentSub(newSub as Sub);
        Alert.alert("✅ Abònman Aktive!", `Plan ${planId.toUpperCase()} ou aktif kounye a.`);
      } else {
        const data = await request<{ sessionUrl: string }>("/subscription/checkout", {
          method: "POST",
          body: JSON.stringify({ planId }),
        });
        if (data?.sessionUrl) await Linking.openURL(data.sessionUrl);
      }
    } catch (e: any) {
      Alert.alert("Erè", e?.message ?? "Pa ka souscri. Verifye balans ou.");
    } finally { setSubscribing(null); }
  };

  const handleCancel = () => {
    Alert.alert(
      "Anile Abònman",
      "Abònman ou ap rete aktif jiska fen peryòd la. Ou vle kontinye?",
      [
        { text: "Non", style: "cancel" },
        {
          text: "Wi, Anile", style: "destructive",
          onPress: async () => {
            try {
              await request("/subscription/cancel", { method: "POST" });
              const newSub = await request<Sub>("/subscription/my");
              setCurrentSub(newSub as Sub);
              Alert.alert("Abònman Anile", "Abònman ou ap fini nan dat ki te planifye.");
            } catch { Alert.alert("Erè", "Pa ka anile."); }
          }
        }
      ]
    );
  };

  const handleUncancel = async () => {
    try {
      await request("/subscription/uncancel", { method: "POST" });
      const newSub = await request<Sub>("/subscription/my");
      setCurrentSub(newSub as Sub);
      Alert.alert("✅ Reaktive!", "Abònman ou kontinyel.");
    } catch { Alert.alert("Erè", "Pa ka reaktive."); }
  };

  const activePlan = currentSub?.planId ?? "basic";
  const totalBalance = (wallet?.balanceUsd ?? 0) + (wallet?.promoBalance ?? 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 10, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Abònman</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 16 }}>
          {/* Current Sub Banner */}
          {currentSub && currentSub.planId !== "basic" && (
            <View style={[styles.currentBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View>
                <Text style={[styles.currentLabel, { color: colors.mutedForeground }]}>Plan Aktyèl</Text>
                <Text style={[styles.currentPlan, { color: colors.foreground }]}>{currentSub.planId.toUpperCase()}</Text>
                {currentSub.currentPeriodEnd && (
                  <Text style={[styles.currentExpiry, { color: colors.mutedForeground }]}>
                    {currentSub.cancelAtPeriodEnd ? "⚠️ Ap fini" : "✅ Renouvle"}: {new Date(currentSub.currentPeriodEnd).toLocaleDateString("fr-FR")}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.manageBtn, { borderColor: currentSub.cancelAtPeriodEnd ? "#22C55E" : "#EF4444" }]}
                onPress={currentSub.cancelAtPeriodEnd ? handleUncancel : handleCancel}>
                <Text style={[styles.manageBtnText, { color: currentSub.cancelAtPeriodEnd ? "#22C55E" : "#EF4444" }]}>
                  {currentSub.cancelAtPeriodEnd ? "Reaktive" : "Anile"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Hidden listings warning */}
          {hiddenCount > 0 && (
            <View style={[styles.warningCard, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
              <Feather name="alert-triangle" size={16} color="#F59E0B" />
              <Text style={styles.warningText}>{hiddenCount} lis kache — deplase nan plan siperyè pou restore yo.</Text>
            </View>
          )}

          {/* Wallet balance */}
          {wallet && (
            <View style={[styles.walletRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="credit-card" size={16} color={colors.primary} />
              <Text style={[styles.walletText, { color: colors.foreground }]}>
                FM Wallet: <Text style={{ color: "#22C55E", fontFamily: "Inter_700Bold" }}>${wallet.balanceUsd.toFixed(2)}</Text>
                {wallet.promoBalance > 0 && <Text style={{ color: "#F59E0B" }}> + ${wallet.promoBalance.toFixed(2)} promo</Text>}
              </Text>
            </View>
          )}

          {/* Payment Method */}
          <View style={styles.methodRow}>
            {(["wallet", "card"] as const).map((m) => (
              <TouchableOpacity key={m} onPress={() => setMethod(m)}
                style={[styles.methodBtn, { borderColor: method === m ? colors.primary : colors.border, backgroundColor: method === m ? colors.primary + "15" : colors.card }]}>
                <Feather name={m === "wallet" ? "credit-card" : "globe"} size={14} color={method === m ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.methodBtnText, { color: method === m ? colors.primary : colors.foreground }]}>
                  {m === "wallet" ? "FM Wallet" : "Kat Kredi"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Plan Cards */}
          {PLANS.map((plan) => {
            const isActive = activePlan === plan.id;
            const canAfford = totalBalance >= plan.price;
            return (
              <View key={plan.id} style={[styles.planWrapper, isActive && styles.activePlanWrapper]}>
                <LinearGradient colors={plan.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.planCard}>
                  <View style={styles.planTop}>
                    <View>
                      {plan.badge && (
                        <View style={styles.planBadge}>
                          <Text style={styles.planBadgeText}>{plan.badge}</Text>
                        </View>
                      )}
                      <Text style={styles.planName}>{plan.name}</Text>
                      <Text style={styles.planListings}>{plan.listings}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.planPrice}>
                        {plan.price === 0 ? "Gratis" : `$${plan.price}`}
                      </Text>
                      {plan.price > 0 && <Text style={styles.planPer}>/mwa</Text>}
                    </View>
                  </View>
                  <View style={styles.planFeatures}>
                    {plan.features.map((f) => (
                      <View key={f} style={styles.featureRow}>
                        <Feather name="check" size={13} color="rgba(255,255,255,0.9)" />
                        <Text style={styles.featureText}>{f}</Text>
                      </View>
                    ))}
                  </View>
                  {isActive ? (
                    <View style={styles.activePill}>
                      <Feather name="check-circle" size={14} color="#22C55E" />
                      <Text style={styles.activePillText}>Plan Aktyèl</Text>
                    </View>
                  ) : plan.price > 0 ? (
                    <Pressable
                      style={[styles.subscribeBtn, { opacity: (subscribing === plan.id || (!canAfford && method === "wallet")) ? 0.6 : 1 }]}
                      onPress={() => handleSubscribe(plan.id, plan.price)}
                      disabled={subscribing === plan.id}>
                      {subscribing === plan.id
                        ? <ActivityIndicator color="#6366F1" size="small" />
                        : <Text style={styles.subscribeBtnText}>
                            {method === "wallet" && !canAfford ? "Balans ensifizan" : `Pran Plan ${plan.name}`}
                          </Text>}
                    </Pressable>
                  ) : null}
                </LinearGradient>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  currentBanner: { borderRadius: 14, borderWidth: 1, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  currentLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  currentPlan: { fontSize: 20, fontFamily: "Inter_700Bold" },
  currentExpiry: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  manageBtn: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  manageBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  warningCard: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  warningText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", color: "#92400E" },
  walletRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  walletText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  methodRow: { flexDirection: "row", gap: 10 },
  methodBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10 },
  methodBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  planWrapper: { borderRadius: 20, overflow: "hidden" },
  activePlanWrapper: { shadowColor: "#6366F1", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  planCard: { padding: 20, gap: 14 },
  planTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  planBadge: { backgroundColor: "rgba(255,255,255,0.25)", alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginBottom: 4 },
  planBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  planName: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  planListings: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  planPrice: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" },
  planPer: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_400Regular" },
  planFeatures: { gap: 7 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  featureText: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontFamily: "Inter_400Regular" },
  activePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  activePillText: { color: "#22C55E", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  subscribeBtn: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  subscribeBtnText: { color: "#1E1B4B", fontSize: 15, fontFamily: "Inter_700Bold" },
});
