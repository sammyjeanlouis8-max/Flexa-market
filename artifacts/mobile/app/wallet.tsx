import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
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
  recharge: "arrow-down-circle",
  boost_debit: "trending-up",
  sale_earnings: "dollar-sign",
  return_refund: "rotate-ccw",
  promo_boost_debit: "zap",
  withdrawal: "arrow-up-circle",
  transfer: "send",
};

const TX_COLOR: Record<string, string> = {
  recharge: "#22C55E",
  sale_earnings: "#22C55E",
  return_refund: "#22C55E",
  boost_debit: "#EF4444",
  promo_boost_debit: "#F59E0B",
  withdrawal: "#EF4444",
  transfer: "#3B82F6",
};

const PRESET_AMOUNTS = [10, 25, 50, 100, 200];

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const { t } = useLanguage();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Platform revenue (super admin only) ───────────────────────────────────
  const [platformRev, setPlatformRev] = useState<{
    totalRevenue: number; boostRevenue: number; merchantCommission: number;
    rechargeFees: number; subscriptionRevenue: number;
    p2pTransferFees: number; deliveryFees: number;
  } | null>(null);
  const [platformRevLoading, setPlatformRevLoading] = useState(false);
  const loadPlatformRev = useCallback(async () => {
    if (!isSuperAdmin) return;
    setPlatformRevLoading(true);
    try {
      const data = await request<{ summary: typeof platformRev }>("/admin/platform-revenue?period=all");
      if (data?.summary) setPlatformRev(data.summary);
    } catch { /* silent */ } finally { setPlatformRevLoading(false); }
  }, [isSuperAdmin, request]);
  useEffect(() => { if (isSuperAdmin) loadPlatformRev(); }, [isSuperAdmin]);

  // ── Stripe Recharge Modal ───────────────────────────────────────────────
  const [rechargeVisible, setRechargeVisible] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(25);
  const [customAmount, setCustomAmount] = useState("");
  const [recharging, setRecharging] = useState(false);
  const customInputRef = useRef<TextInput>(null);

  const fetchData = useCallback(async () => {
    try {
      const [walletData, txData] = await Promise.all([
        request<WalletInfo>("/wallet"),
        request<{ transactions: WalletTx[] } | WalletTx[]>("/wallet/history?limit=50"),
      ]);
      setWallet(walletData);
      const items = Array.isArray(txData) ? txData : ((txData as { transactions: WalletTx[] }).transactions ?? []);
      setTxs(items);
    } catch {
      setWallet(null);
    }
  }, [request]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const getEffectiveAmount = (): number | null => {
    if (customAmount.trim()) {
      const v = parseFloat(customAmount.replace(",", "."));
      return isNaN(v) ? null : v;
    }
    return selectedAmount;
  };

  const handleStripeRecharge = async () => {
    const amount = getEffectiveAmount();
    if (!amount || amount < 1) {
      Alert.alert("Montan pa valid", "Montan minimòm se $1.00 USD");
      return;
    }
    if (amount > 500) {
      Alert.alert("Montan twò elve", "Montan maksimòm se $500 USD");
      return;
    }

    setRecharging(true);
    try {
      const data = await request<{ sessionUrl: string }>("/wallet/topup/card/session", {
        method: "POST",
        body: JSON.stringify({ amountUsd: amount }),
      });

      if (!data?.sessionUrl) {
        Alert.alert("Erè", "Nou pa ka kreye sesyon Stripe. Eseye ankò.");
        return;
      }

      setRechargeVisible(false);
      await Linking.openURL(data.sessionUrl);

      // Refresh wallet after returning from Stripe (slight delay for webhook)
      setTimeout(() => {
        fetchData();
      }, 3000);
    } catch (err: any) {
      Alert.alert("Erè rechaj", err?.message ?? "Erè enkoni. Eseye ankò.");
    } finally {
      setRecharging(false);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const isCredit = (type: string) =>
    ["recharge", "sale_earnings", "return_refund", "promo_convert"].includes(type);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("walletTitle")}</Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={txs}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListHeaderComponent={
            <>
              {wallet && (
                <View style={[styles.balanceCard, { backgroundColor: colors.primary }]}>
                  <Text style={styles.balanceLabel}>{t("realBalance")}</Text>
                  <Text style={styles.balanceAmount}>${wallet.balanceUsd?.toFixed(2) ?? "0.00"}</Text>
                  <View style={styles.promoRow}>
                    <View style={styles.promoItem}>
                      <Text style={styles.promoLabel}>{t("promoBalance")}</Text>
                      <Text style={styles.promoValue}>${wallet.promoBalance?.toFixed(2) ?? "0.00"}</Text>
                    </View>
                    <View style={[styles.promoDivider]} />
                    <View style={styles.promoItem}>
                      <Text style={styles.promoLabel}>{t("unlockedBalance")}</Text>
                      <Text style={styles.promoValue}>${wallet.unlockedBalance?.toFixed(2) ?? "0.00"}</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* ── Platform Green Card (super admin only) ── */}
              {isSuperAdmin && (
                <Pressable
                  onPress={loadPlatformRev}
                  style={[styles.platformCard, { opacity: platformRevLoading ? 0.75 : 1 }]}
                >
                  <View style={styles.platformCardTop}>
                    <View>
                      <Text style={styles.platformCardTitle}>KAT FM FLEXAMARKET</Text>
                      <Text style={styles.platformCardId}>FM-FLEXA-MARKET</Text>
                    </View>
                    <View style={styles.platformRefreshBtn}>
                      <Feather name="refresh-cw" size={13} color="rgba(255,255,255,0.75)" />
                    </View>
                  </View>
                  <Text style={styles.platformCardLabel}>Kont Platfòm Ofisyèl</Text>
                  {platformRevLoading ? (
                    <ActivityIndicator color="#34d399" size="small" style={{ marginVertical: 6 }} />
                  ) : (
                    <Text style={styles.platformCardAmount}>
                      ${platformRev?.totalRevenue?.toFixed(2) ?? "0.00"}
                    </Text>
                  )}
                  {platformRev && platformRev.totalRevenue > 0 && (
                    <View style={styles.platformBreakdown}>
                      {platformRev.merchantCommission > 0 && (
                        <Text style={styles.platformBreakItem}>Komisyon <Text style={{ color: "#fff" }}>${platformRev.merchantCommission.toFixed(2)}</Text></Text>
                      )}
                      {platformRev.boostRevenue > 0 && (
                        <Text style={styles.platformBreakItem}>Boost <Text style={{ color: "#fff" }}>${platformRev.boostRevenue.toFixed(2)}</Text></Text>
                      )}
                      {platformRev.p2pTransferFees > 0 && (
                        <Text style={styles.platformBreakItem}>Transfè <Text style={{ color: "#fff" }}>${platformRev.p2pTransferFees.toFixed(2)}</Text></Text>
                      )}
                      {platformRev.deliveryFees > 0 && (
                        <Text style={styles.platformBreakItem}>Livrezon 15% <Text style={{ color: "#fff" }}>${platformRev.deliveryFees.toFixed(2)}</Text></Text>
                      )}
                      {platformRev.subscriptionRevenue > 0 && (
                        <Text style={styles.platformBreakItem}>Abònman <Text style={{ color: "#fff" }}>${platformRev.subscriptionRevenue.toFixed(2)}</Text></Text>
                      )}
                      {platformRev.rechargeFees > 0 && (
                        <Text style={styles.platformBreakItem}>Rechaj <Text style={{ color: "#fff" }}>${platformRev.rechargeFees.toFixed(2)}</Text></Text>
                      )}
                    </View>
                  )}
                </Pressable>
              )}

              {/* ── Stripe Card Recharge Button ── */}
              <Pressable
                style={styles.rechargeHero}
                onPress={() => setRechargeVisible(true)}
              >
                <View style={styles.rechargeHeroLeft}>
                  <View style={styles.rechargeIconCircle}>
                    <Feather name="credit-card" size={26} color="#fff" />
                  </View>
                  <View>
                    <Text style={styles.rechargeHeroLabel}>Recharge ak Kat Kredi</Text>
                    <Text style={styles.rechargeHeroSub}>Visa · Mastercard · Stripe</Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.8)" />
              </Pressable>

              {/* ── MonCash / Other Recharge ── */}
              <Pressable
                style={[styles.rechargeSecondary, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => Alert.alert(t("rechargeTitle"), t("rechargeMsg"), [{ text: t("ok") }])}
              >
                <View style={styles.rechargeHeroLeft}>
                  <View style={[styles.rechargeIconCircle, { backgroundColor: "#EF4444" }]}>
                    <Feather name="smartphone" size={22} color="#fff" />
                  </View>
                  <View>
                    <Text style={[styles.rechargeSecondaryLabel, { color: colors.foreground }]}>MonCash · Kòd FM</Text>
                    <Text style={[styles.rechargeHeroSub, { color: colors.mutedForeground }]}>Recharge lokal Ayiti</Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
              </Pressable>

              <View style={styles.actionsRow}>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => Alert.alert(t("sendTitle"), t("sendMsg"), [{ text: t("ok") }])}
                >
                  <Feather name="send" size={20} color={colors.primary} />
                  <Text style={[styles.actionLabel, { color: colors.foreground }]}>{t("send")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => Alert.alert(t("withdrawTitle"), t("withdrawMsg"), [{ text: t("ok") }])}
                >
                  <Feather name="arrow-up-circle" size={20} color={colors.primary} />
                  <Text style={[styles.actionLabel, { color: colors.foreground }]}>{t("withdraw")}</Text>
                </Pressable>
              </View>

              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("txHistory")}</Text>
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="credit-card" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t("noTransactionsHint")}</Text>
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
                  <Text style={[styles.txType, { color: colors.foreground }]}>
                    {item.type.replace(/_/g, " ")}
                  </Text>
                  {item.note ? (
                    <Text style={[styles.txNote, { color: colors.mutedForeground }]} numberOfLines={1}>{item.note}</Text>
                  ) : null}
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
      <Modal
        visible={rechargeVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRechargeVisible(false)}
      >
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
              Chwazi montan ou vle recharge nan pòtfèy FM ou (min $1 · max $500)
            </Text>

            {/* Preset amounts */}
            <View style={styles.presetRow}>
              {PRESET_AMOUNTS.map((amt) => {
                const active = selectedAmount === amt && !customAmount;
                return (
                  <Pressable
                    key={amt}
                    style={[
                      styles.presetBtn,
                      { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : colors.background },
                    ]}
                    onPress={() => { setSelectedAmount(amt); setCustomAmount(""); }}
                  >
                    <Text style={[styles.presetLabel, { color: active ? colors.primary : colors.foreground }]}>
                      ${amt}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Custom amount */}
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

            {/* Effective amount display */}
            {(getEffectiveAmount() ?? 0) > 0 && (
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Ou ap recharge:</Text>
                <Text style={[styles.summaryAmount, { color: colors.primary }]}>
                  ${(getEffectiveAmount() ?? 0).toFixed(2)} USD
                </Text>
              </View>
            )}

            <Text style={[styles.stripeNote, { color: colors.mutedForeground }]}>
              🔒 Peman pwoteje pa Stripe. Kòb la ap parèt nan pòtfèy ou imedyatman apre konfirmasyon.
            </Text>

            <Pressable
              style={[styles.payBtn, { backgroundColor: colors.primary, opacity: recharging ? 0.7 : 1 }]}
              onPress={handleStripeRecharge}
              disabled={recharging}
            >
              {recharging ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="credit-card" size={18} color="#fff" />
                  <Text style={styles.payBtnLabel}>
                    Peye ${(getEffectiveAmount() ?? 0).toFixed(2)} ak Stripe
                  </Text>
                </>
              )}
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
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { padding: 16, gap: 8 },
  balanceCard: { borderRadius: 20, padding: 24, marginBottom: 16 },
  balanceLabel: { fontSize: 13, color: "rgba(255,255,255,0.75)", fontFamily: "Inter_500Medium", marginBottom: 4 },
  balanceAmount: { fontSize: 42, fontFamily: "Inter_700Bold", color: "#fff", marginBottom: 16 },
  promoRow: { flexDirection: "row", backgroundColor: "rgba(0,0,0,0.15)", borderRadius: 12, padding: 12 },
  promoItem: { flex: 1, alignItems: "center" },
  promoDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: 4 },
  promoLabel: { fontSize: 11, color: "rgba(255,255,255,0.65)", fontFamily: "Inter_400Regular", marginBottom: 2 },
  promoValue: { fontSize: 16, color: "#fff", fontFamily: "Inter_700Bold" },
  rechargeHero: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#16A34A", borderRadius: 18, padding: 18, marginBottom: 10,
    shadowColor: "#16A34A", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  rechargeSecondary: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1,
  },
  rechargeHeroLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  rechargeIconCircle: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  rechargeHeroLabel: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
  rechargeSecondaryLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rechargeHeroSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 2 },
  actionsRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  actionBtn: { flex: 1, alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  actionLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  empty: { alignItems: "center", paddingTop: 32, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  txCard: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 14, gap: 12, marginBottom: 8 },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txInfo: { flex: 1 },
  txType: { fontSize: 14, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  txNote: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  txDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  txAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  // ── Modal ──
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 12 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalClose: { padding: 4 },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 20, lineHeight: 18 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  presetBtn: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  presetLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  customRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  customDollar: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginRight: 6 },
  customInput: { flex: 1, fontSize: 18, fontFamily: "Inter_500Medium" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  summaryAmount: { fontSize: 20, fontFamily: "Inter_700Bold" },
  stripeNote: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 20, lineHeight: 17 },
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, padding: 16 },
  payBtnLabel: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  // ── Platform Green Card ──
  platformCard: {
    borderRadius: 20, padding: 20, marginBottom: 12,
    backgroundColor: "#064E3B",
    shadowColor: "#10B981", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8,
    borderWidth: 1, borderColor: "rgba(52,211,153,0.35)",
  },
  platformCardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 },
  platformCardTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 1.2 },
  platformCardId: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(52,211,153,0.65)", marginTop: 2, letterSpacing: 0.5 },
  platformRefreshBtn: {
    width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
  },
  platformCardLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#34d399", marginBottom: 4, letterSpacing: 0.5 },
  platformCardAmount: { fontSize: 38, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.5, marginBottom: 10 },
  platformBreakdown: { flexDirection: "row", flexWrap: "wrap", gap: 8, rowGap: 4 },
  platformBreakItem: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(167,243,208,0.70)" },
});
