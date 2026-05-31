import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";

interface WalletInfo {
  balanceUsd: number;
  availableUsd: number;
  promoBalance: number;
  unlockedBalance: number;
  newUnlockableUsd: number;
  balanceHtg: number;
  rateHtgToUsd: number;
  accountNumber?: string;
  moncashPlatformNumber?: string;
}

interface ReferralInfo {
  referralCode: string | null;
  totalReferred: number;
  bonusesPaid: number;
  pendingBonuses: number;
  bonusPerReferral: number;
  promoBalance: number;
  unlockedBalance: number;
}

interface WalletTx {
  id: number;
  type: string;
  amountUsd: number;
  status: string;
  note?: string;
  createdAt: string;
}

const TX_ICON: Record<string, string> = {
  recharge: "arrow-down-circle", boost_debit: "trending-up",
  sale_earnings: "dollar-sign", return_refund: "rotate-ccw",
  promo_boost_debit: "zap", withdrawal: "arrow-up-circle",
  transfer: "send", promo_unlock: "unlock",
};
const TX_COLOR: Record<string, string> = {
  recharge: "#22C55E", sale_earnings: "#22C55E", return_refund: "#22C55E",
  promo_unlock: "#22C55E", boost_debit: "#EF4444",
  promo_boost_debit: "#F59E0B", withdrawal: "#EF4444", transfer: "#3B82F6",
};
const PRESET_AMOUNTS = [10, 25, 50, 100, 200];

const isCredit = (type: string) =>
  ["recharge", "sale_earnings", "return_refund", "promo_convert", "promo_unlock"].includes(type);

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const { t } = useLanguage();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin" || user?.isSuperAdmin;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [referral, setReferral] = useState<ReferralInfo | null>(null);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balanceHidden, setBalanceHidden] = useState(false);

  const [platformRev, setPlatformRev] = useState<any>(null);
  const [platformRevLoading, setPlatformRevLoading] = useState(false);

  const [rechargeVisible, setRechargeVisible] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(25);
  const [customAmount, setCustomAmount] = useState("");
  const [recharging, setRecharging] = useState(false);
  const customInputRef = useRef<TextInput>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [walletData, txData, referralData] = await Promise.all([
        request<WalletInfo>("/wallet"),
        request<{ transactions: WalletTx[] } | WalletTx[]>("/wallet/history?limit=50"),
        request<ReferralInfo>("/wallet/referral"),
      ]);
      setWallet(walletData as WalletInfo);
      const raw = txData as any;
      setTxs(Array.isArray(raw) ? raw : (raw?.transactions ?? []));
      setReferral(referralData as ReferralInfo);
    } catch (e: any) {
      setError(e?.message ?? "Erè koneksyon. Verifye entènèt ou.");
    }
  }, [request]);

  const loadPlatformRev = useCallback(async () => {
    if (!isSuperAdmin) return;
    setPlatformRevLoading(true);
    try {
      const data = await request<any>("/admin/platform-revenue?period=all");
      if (data?.summary) setPlatformRev(data.summary);
    } catch { } finally { setPlatformRevLoading(false); }
  }, [isSuperAdmin, request]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchData(), isSuperAdmin ? loadPlatformRev() : Promise.resolve()])
      .finally(() => setLoading(false));
  }, [fetchData, isSuperAdmin]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), isSuperAdmin ? loadPlatformRev() : Promise.resolve()]);
    setRefreshing(false);
  }, [fetchData, isSuperAdmin]);

  const getEffectiveAmount = () => {
    if (customAmount.trim()) {
      const v = parseFloat(customAmount.replace(",", "."));
      return isNaN(v) ? null : v;
    }
    return selectedAmount;
  };

  const handleStripeRecharge = async () => {
    const amount = getEffectiveAmount();
    if (!amount || amount < 1) { Alert.alert("Montan pa valid", "Minimòm $1.00"); return; }
    if (amount > 500) { Alert.alert("Montan twò elve", "Maksimòm $500"); return; }
    setRecharging(true);
    try {
      const data = await request<{ sessionUrl: string }>("/wallet/topup/card/session", {
        method: "POST", body: JSON.stringify({ amountUsd: amount }),
      });
      if (!data?.sessionUrl) { Alert.alert("Erè", "Pa ka kreye sesyon Stripe."); return; }
      setRechargeVisible(false);
      await Linking.openURL(data.sessionUrl);
      setTimeout(() => fetchData(), 3000);
    } catch (err: any) {
      Alert.alert("Erè rechaj", err?.message ?? "Erè enkoni.");
    } finally { setRecharging(false); }
  };

  const copyCode = async (code: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Share.share({ message: code });
  };

  const shareCode = async (code: string) => {
    await Share.share({
      message: `Rejwen FlexaMarket epi jwenn bonès! Itilize kòd referans mwen: ${code}\nhttps://flexamarket.com`,
    });
  };

  const fmt = (n: number) => balanceHidden ? "••••••" : `$${n.toFixed(2)}`;
  const fmtHtg = (n: number) => balanceHidden ? "••• HTG" : `G ${n.toLocaleString()} HTG`;
  const walletId = wallet?.accountNumber ?? `FM-${String(user?.id ?? "").padStart(6, "0")}`;

  // ─── QUICK ACTIONS ───────────────────────────────────────────────────────────
  const QUICK_ACTIONS = [
    { icon: "arrow-down-circle", label: "Déposer", color: "#22C55E", onPress: () => setRechargeVisible(true) },
    { icon: "send", label: "Envoyer", color: "#3B82F6", onPress: () => Alert.alert("Transfè", "Fonksyon sa disponib sou sit wèb la.") },
    { icon: "users", label: "Contacts", color: "#8B5CF6", onPress: () => Alert.alert("Contacts", "Ouvri contacts ou.") },
    { icon: "gift", label: "Bonus", color: "#F59E0B", onPress: () => router.push("/wallet") },
    { icon: "arrow-up-circle", label: "Recevoir", color: "#EC4899", onPress: () => Alert.alert("Recevoir", "Pataje kòd wallet ou.") },
    { icon: "list", label: "Historique", color: "#64748B", onPress: () => {} },
    { icon: "credit-card", label: "Carte FM", color: "#0EA5E9", onPress: () => Alert.alert("Carte FM", "Fonksyon sa ap vini byento.") },
  ];

  // ─── FEATURE CARDS ───────────────────────────────────────────────────────────
  const FEATURE_CARDS = [
    {
      id: "recharge",
      gradient: ["#1E40AF", "#6D28D9"] as [string, string],
      icon: "repeat",
      title: "Recharge • Withdrawal",
      subtitle: "MoncCash · Card · Agent · Crypto",
      badge: null,
      onPress: () => setRechargeVisible(true),
    },
    {
      id: "pret",
      gradient: ["#1D4ED8", "#2563EB"] as [string, string],
      icon: "dollar-sign",
      title: "Prêt Business",
      subtitle: "Financement pour marchands sérieux — 15% d'intérêt, remboursement automatique",
      badge: "JUSQU'À $3,000",
      badgeColor: "#BFDBFE",
      onPress: () => router.push("/loans"),
    },
    ...(isSuperAdmin ? [{
      id: "agent-panel",
      gradient: ["#0F766E", "#059669"] as [string, string],
      icon: "shield",
      title: "Panel Ajan Mwen",
      subtitle: "Modifye taux an gro, taux an detay, estati, ak profil ou",
      badge: "OTORIZE",
      badgeColor: "#6EE7B7",
      onPress: () => router.push("/admin"),
    }] : []),
    {
      id: "agent",
      gradient: ["#5B21B6", "#7C3AED"] as [string, string],
      icon: "user-check",
      title: "Devenir Agent Autorisé",
      subtitle: "Échange de devises, transferts élevés, opérations cash-in/out",
      badge: "JUSQU'À $15K/MOIS",
      badgeColor: "#DDD6FE",
      onPress: () => Alert.alert("Agent Autorisé", "Kontakte ekip FlexaMarket pou aplike."),
    },
    {
      id: "driver",
      gradient: ["#C2410C", "#EA580C"] as [string, string],
      icon: "truck",
      title: "Postuler comme Chauffeur",
      subtitle: "Livraisons Disponibles — mon profil chauffeur",
      badge: "LIVRAISON FM",
      badgeColor: "#FED7AA",
      onPress: () => Alert.alert("Chauffeur FM", "Redirijman ap vini byento."),
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 10, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Portefeuille FM</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.headerBtn}>
          <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : error ? (
        <View style={styles.centered}>
          <Feather name="wifi-off" size={52} color={colors.mutedForeground} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>Koneksyon echwe</Text>
          <Text style={[styles.errorMsg, { color: colors.mutedForeground }]}>{error}</Text>
          <Pressable style={[styles.retryBtn, { backgroundColor: colors.accent }]}
            onPress={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }}>
            <Feather name="refresh-cw" size={16} color="#FFF" />
            <Text style={styles.retryText}>Eseye Ankò</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={txs}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListHeaderComponent={
            <View style={{ gap: 0 }}>
              {/* ── FLEXA WALLET Card ── */}
              <LinearGradient
                colors={["#1E1B4B", "#312E81", "#4338CA"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.walletCard}
              >
                <View style={styles.walletCardTop}>
                  <View style={styles.walletLogoRow}>
                    <View style={styles.walletLogo}>
                      <Text style={styles.walletLogoText}>F</Text>
                    </View>
                    <View>
                      <Text style={styles.walletName}>FLEXA WALLET</Text>
                      <Text style={styles.walletId}>{walletId}</Text>
                    </View>
                  </View>
                  <View style={styles.walletTopActions}>
                    <TouchableOpacity onPress={() => setBalanceHidden(h => !h)} style={styles.walletIconBtn}>
                      <Feather name={balanceHidden ? "eye-off" : "eye"} size={18} color="rgba(255,255,255,0.75)" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.walletIconBtn}>
                      <Feather name="grid" size={18} color="rgba(255,255,255,0.75)" />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.walletBalanceLabel}>Balans Total</Text>
                <Text style={styles.walletBalance}>{fmt(wallet?.balanceUsd ?? 0)}</Text>
                {wallet?.balanceHtg !== undefined && (
                  <Text style={styles.walletHtg}>{fmtHtg(wallet.balanceHtg)}</Text>
                )}

                <View style={styles.walletCardActions}>
                  <TouchableOpacity style={styles.walletCardBtn} onPress={() => copyCode(walletId)}>
                    <Feather name="copy" size={13} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.walletCardBtnText}>Copy ID</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.walletCardBtn}
                    onPress={() => Share.share({ message: `Mon Wallet FlexaMarket: ${walletId}` })}>
                    <Feather name="share-2" size={13} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.walletCardBtnText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>

              {/* ── KAT FM FLEXAMARKET (admin) ── */}
              {isSuperAdmin && (
                <LinearGradient
                  colors={["#064E3B", "#065F46", "#047857"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.platformCard}
                >
                  <View style={styles.walletCardTop}>
                    <View>
                      <Text style={styles.platformCardName}>KAT FM FLEXAMARKET</Text>
                      <Text style={styles.walletId}>FM-FLEXA-MARKET</Text>
                    </View>
                    <TouchableOpacity style={styles.walletIconBtn} onPress={loadPlatformRev}>
                      {platformRevLoading
                        ? <ActivityIndicator color="rgba(255,255,255,0.75)" size="small" />
                        : <Feather name="refresh-cw" size={16} color="rgba(255,255,255,0.75)" />}
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.walletBalanceLabel}>Kont Platfòm Ofisyèl</Text>
                  <Text style={styles.walletBalance}>${platformRev?.totalRevenue?.toFixed(2) ?? "0.00"}</Text>
                  {platformRev && (
                    <View style={styles.platformBreak}>
                      {platformRev.merchantCommission > 0 && <Text style={styles.platformItem}>Komisyon <Text style={{ color: "#6EE7B7" }}>${platformRev.merchantCommission.toFixed(2)}</Text></Text>}
                      {platformRev.boostRevenue > 0 && <Text style={styles.platformItem}>Boost <Text style={{ color: "#6EE7B7" }}>${platformRev.boostRevenue.toFixed(2)}</Text></Text>}
                      {platformRev.p2pTransferFees > 0 && <Text style={styles.platformItem}>Transfè <Text style={{ color: "#6EE7B7" }}>${platformRev.p2pTransferFees.toFixed(2)}</Text></Text>}
                    </View>
                  )}
                  <View style={styles.walletCardActions}>
                    <TouchableOpacity style={styles.walletCardBtn} onPress={() => copyCode("FM-FLEXA-MARKET")}>
                      <Feather name="copy" size={13} color="rgba(255,255,255,0.85)" />
                      <Text style={styles.walletCardBtnText}>Copy ID</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.walletCardBtn} onPress={() => router.push("/website")}>
                      <Feather name="bar-chart-2" size={13} color="rgba(255,255,255,0.85)" />
                      <Text style={styles.walletCardBtnText}>Relevé Mwa</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.walletCardBtn}>
                      <Feather name="share-2" size={13} color="rgba(255,255,255,0.85)" />
                      <Text style={styles.walletCardBtnText}>Share</Text>
                    </TouchableOpacity>
                  </View>
                </LinearGradient>
              )}

              {/* ── Quick Actions ── */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickActionsRow}>
                {QUICK_ACTIONS.map((a) => (
                  <TouchableOpacity key={a.label} style={styles.quickAction} onPress={a.onPress}>
                    <View style={[styles.quickActionIcon, { backgroundColor: a.color + "22" }]}>
                      <Feather name={a.icon as any} size={20} color={a.color} />
                    </View>
                    <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* ── Balance Breakdown ── */}
              {wallet && (
                <View style={[styles.balanceBreakRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.balanceBreakItem}>
                    <Text style={[styles.balanceBreakLabel, { color: colors.mutedForeground }]}>$ Disponible</Text>
                    <Text style={[styles.balanceBreakAmount, { color: colors.foreground }]}>{fmt(wallet.availableUsd ?? wallet.balanceUsd)}</Text>
                    <Text style={[styles.balanceBreakSub, { color: colors.mutedForeground }]}>Disponible librement</Text>
                  </View>
                  <View style={[styles.balanceBreakDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.balanceBreakItem}>
                    <Text style={[styles.balanceBreakLabel, { color: "#F59E0B" }]}>🎁 Promo</Text>
                    <Text style={[styles.balanceBreakAmount, { color: "#F59E0B" }]}>{fmt(wallet.promoBalance)}</Text>
                    <Text style={[styles.balanceBreakSub, { color: colors.mutedForeground }]}>Bloqué · dépenser en boost</Text>
                  </View>
                  <View style={[styles.balanceBreakDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.balanceBreakItem}>
                    <Text style={[styles.balanceBreakLabel, { color: "#22C55E" }]}>⇄ Débloqué</Text>
                    <Text style={[styles.balanceBreakAmount, { color: "#22C55E" }]}>{fmt(wallet.unlockedBalance)}</Text>
                    <Text style={[styles.balanceBreakSub, { color: colors.mutedForeground }]}>Prêt à convertir</Text>
                  </View>
                </View>
              )}

              {/* ── Feature Cards ── */}
              <View style={styles.featureCards}>
                {FEATURE_CARDS.map((card) => (
                  <TouchableOpacity key={card.id} onPress={card.onPress} activeOpacity={0.85}>
                    <LinearGradient
                      colors={card.gradient}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.8 }}
                      style={styles.featureCard}
                    >
                      <View style={styles.featureCardLeft}>
                        <View style={styles.featureCardIcon}>
                          <Feather name={card.icon as any} size={22} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.featureCardTitleRow}>
                            <Text style={styles.featureCardTitle}>{card.title}</Text>
                            {card.badge && (
                              <View style={[styles.featureBadge, { backgroundColor: card.badgeColor + "33" }]}>
                                <Text style={[styles.featureBadgeText, { color: card.badgeColor }]}>{card.badge}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.featureCardSub} numberOfLines={2}>{card.subtitle}</Text>
                        </View>
                      </View>
                      <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.7)" />
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ── Referral Code ── */}
              {referral && (
                <View style={[styles.referralCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.referralHeader}>
                    <Feather name="gift" size={18} color={colors.primary} />
                    <Text style={[styles.referralTitle, { color: colors.foreground }]}>Votre code promo (Referral)</Text>
                    <Text style={[styles.referralLearn, { color: colors.primary }]}>Learn more ▼</Text>
                  </View>
                  <View style={[styles.referralCodeBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.referralCode, { color: colors.primary }]}>
                      {referral.referralCode ?? "CHAJMAN..."}
                    </Text>
                    <View style={styles.referralCodeActions}>
                      <TouchableOpacity onPress={() => referral.referralCode && copyCode(referral.referralCode)}
                        style={[styles.referralCodeBtn, { borderColor: colors.border }]}>
                        <Feather name="copy" size={15} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => referral.referralCode && shareCode(referral.referralCode)}
                        style={[styles.referralCodeBtn, { borderColor: colors.border }]}>
                        <Feather name="share-2" size={15} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.referralStats}>
                    <View style={styles.referralStat}>
                      <Text style={[styles.referralStatNum, { color: colors.foreground }]}>{referral.totalReferred}</Text>
                      <Text style={[styles.referralStatLabel, { color: colors.mutedForeground }]}>Inscrits</Text>
                    </View>
                    <View style={[styles.referralStatDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.referralStat}>
                      <Text style={[styles.referralStatNum, { color: "#F59E0B" }]}>${referral.promoBalance.toFixed(2)}</Text>
                      <Text style={[styles.referralStatLabel, { color: colors.mutedForeground }]}>Bloqué (promo)</Text>
                    </View>
                    <View style={[styles.referralStatDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.referralStat}>
                      <Text style={[styles.referralStatNum, { color: "#22C55E" }]}>${referral.unlockedBalance.toFixed(2)}</Text>
                      <Text style={[styles.referralStatLabel, { color: colors.mutedForeground }]}>Débloqué</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* ── Transaction History Title ── */}
              <View style={styles.txHeader}>
                <Text style={[styles.txTitle, { color: colors.foreground }]}>HISTORIQUE DES TRANSACTIONS</Text>
                <TouchableOpacity><Text style={[styles.txSeeAll, { color: colors.primary }]}>Voir tout →</Text></TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="credit-card" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Pa gen tranzaksyon ankò</Text>
            </View>
          }
          renderItem={({ item }) => {
            const credit = isCredit(item.type);
            const icon = (TX_ICON[item.type] ?? "circle") as any;
            const accentColor = TX_COLOR[item.type] ?? (credit ? "#22C55E" : "#EF4444");
            return (
              <View style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.txIcon, { backgroundColor: accentColor + "22" }]}>
                  <Feather name={icon} size={18} color={accentColor} />
                </View>
                <View style={styles.txInfo}>
                  <Text style={[styles.txType, { color: colors.foreground }]}>{item.type.replace(/_/g, " ")}</Text>
                  {item.note ? <Text style={[styles.txNote, { color: colors.mutedForeground }]} numberOfLines={1}>{item.note}</Text> : null}
                  <Text style={[styles.txDate, { color: colors.mutedForeground }]}>
                    {new Date(item.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: credit ? "#22C55E" : "#EF4444" }]}>
                  {credit ? "+" : "-"}${Math.abs(item.amountUsd)?.toFixed(2)}
                </Text>
              </View>
            );
          }}
        />
      )}

      {/* ── Stripe Recharge Modal ── */}
      <Modal visible={rechargeVisible} transparent animationType="slide" onRequestClose={() => setRechargeVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Recharge ak Kat Kredi</Text>
              <TouchableOpacity onPress={() => setRechargeVisible(false)} style={styles.modalClose}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              Chwazi montan ou vle recharge (min $1 · max $500)
            </Text>
            <View style={styles.presetRow}>
              {PRESET_AMOUNTS.map((amt) => {
                const active = selectedAmount === amt && !customAmount;
                return (
                  <Pressable key={amt}
                    style={[styles.presetBtn, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : colors.background }]}
                    onPress={() => { setSelectedAmount(amt); setCustomAmount(""); }}>
                    <Text style={[styles.presetLabel, { color: active ? colors.primary : colors.foreground }]}>${amt}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={[styles.customRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={[styles.customDollar, { color: colors.mutedForeground }]}>$</Text>
              <TextInput
                ref={customInputRef}
                style={[styles.customInput, { color: colors.foreground }]}
                placeholder="Montan pèsonalize..."
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                value={customAmount}
                onChangeText={(v) => { setCustomAmount(v); setSelectedAmount(null); }}
              />
            </View>
            {(getEffectiveAmount() ?? 0) > 0 && (
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Ou ap recharge:</Text>
                <Text style={[styles.summaryAmount, { color: colors.primary }]}>${(getEffectiveAmount() ?? 0).toFixed(2)} USD</Text>
              </View>
            )}
            <Text style={[styles.stripeNote, { color: colors.mutedForeground }]}>
              🔒 Peman pwoteje pa Stripe. Kòb la ap parèt imedyatman apre konfirmasyon.
            </Text>
            <Pressable style={[styles.payBtn, { backgroundColor: colors.primary, opacity: recharging ? 0.7 : 1 }]}
              onPress={handleStripeRecharge} disabled={recharging}>
              {recharging
                ? <ActivityIndicator color="#fff" size="small" />
                : (<><Feather name="credit-card" size={18} color="#fff" /><Text style={styles.payBtnLabel}>Peye ${(getEffectiveAmount() ?? 0).toFixed(2)} ak Stripe</Text></>)}
            </Pressable>
            <View style={{ height: insets.bottom + 8 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  errorMsg: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { color: "#FFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  // Wallet card
  walletCard: { margin: 16, borderRadius: 24, padding: 22 },
  walletCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  walletLogoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  walletLogo: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  walletLogoText: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  walletName: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  walletId: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  walletTopActions: { flexDirection: "row", gap: 8 },
  walletIconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  walletBalanceLabel: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 4 },
  walletBalance: { color: "#fff", fontSize: 36, fontFamily: "Inter_700Bold", marginBottom: 2 },
  walletHtg: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 16 },
  walletCardActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  walletCardBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  walletCardBtnText: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontFamily: "Inter_500Medium" },
  // Platform card
  platformCard: { marginHorizontal: 16, marginBottom: 4, borderRadius: 24, padding: 22 },
  platformCardName: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  platformBreak: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  platformItem: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_400Regular" },
  // Quick actions
  quickActionsRow: { paddingHorizontal: 16, paddingVertical: 16, gap: 6 },
  quickAction: { alignItems: "center", gap: 8, width: 64 },
  quickActionIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  quickActionLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" },
  // Balance breakdown
  balanceBreakRow: { flexDirection: "row", marginHorizontal: 16, borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 4 },
  balanceBreakItem: { flex: 1, alignItems: "center", gap: 3 },
  balanceBreakDivider: { width: 1, marginVertical: 4 },
  balanceBreakLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  balanceBreakAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  balanceBreakSub: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },
  // Feature cards
  featureCards: { padding: 16, paddingTop: 12, gap: 10 },
  featureCard: { borderRadius: 18, padding: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  featureCardLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14 },
  featureCardIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  featureCardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 },
  featureCardTitle: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  featureBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  featureBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  featureCardSub: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  // Referral
  referralCard: { marginHorizontal: 16, marginBottom: 4, borderRadius: 16, borderWidth: 1, padding: 16 },
  referralHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  referralTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  referralLearn: { fontSize: 12, fontFamily: "Inter_400Regular" },
  referralCodeBox: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 14 },
  referralCode: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: 2, textAlign: "center" },
  referralCodeActions: { flexDirection: "row", gap: 8 },
  referralCodeBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  referralStats: { flexDirection: "row", alignItems: "center" },
  referralStat: { flex: 1, alignItems: "center", gap: 3 },
  referralStatDivider: { width: 1, height: 32 },
  referralStatNum: { fontSize: 18, fontFamily: "Inter_700Bold" },
  referralStatLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  // Transactions
  txHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  txTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  txSeeAll: { fontSize: 12, fontFamily: "Inter_500Medium" },
  empty: { alignItems: "center", paddingTop: 32, gap: 10, paddingHorizontal: 16 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  txCard: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 14, gap: 12, marginHorizontal: 16, marginBottom: 8 },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txInfo: { flex: 1 },
  txType: { fontSize: 14, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  txNote: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  txDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  txAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHandle: { width: 36, height: 4, backgroundColor: "rgba(0,0,0,0.15)", borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 20, lineHeight: 18 },
  presetRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  presetBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
  presetLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  customRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  customDollar: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginRight: 6 },
  customInput: { flex: 1, fontSize: 18, fontFamily: "Inter_400Regular" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  summaryLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  summaryAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  stripeNote: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 16, lineHeight: 18 },
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 52, borderRadius: 14 },
  payBtnLabel: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
