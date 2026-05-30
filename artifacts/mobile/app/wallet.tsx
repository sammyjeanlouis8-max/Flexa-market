import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

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

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const { t } = useLanguage();
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

              <View style={styles.actionsRow}>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => Alert.alert(t("rechargeTitle"), t("rechargeMsg"), [{ text: t("ok") }])}
                >
                  <Feather name="plus-circle" size={20} color={colors.primary} />
                  <Text style={[styles.actionLabel, { color: colors.foreground }]}>{t("recharge")}</Text>
                </Pressable>
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
});
