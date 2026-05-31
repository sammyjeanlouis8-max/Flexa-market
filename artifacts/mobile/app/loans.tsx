import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

interface LoanEligibility {
  eligible: boolean;
  maxAmount?: number;
  reason?: string;
  creditScore?: number;
}

interface Loan {
  id: number;
  amount: number;
  status: string;
  purpose?: string;
  createdAt: string;
  repaidAt?: string;
  dueDate?: string;
  remainingBalance?: number;
  installments?: Array<{ id: number; amount: number; status: string; dueDate: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  approved: "#22C55E",
  active: "#6366F1",
  repaid: "#22C55E",
  rejected: "#EF4444",
  defaulted: "#EF4444",
};

export default function LoansScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const [tab, setTab] = useState<"my" | "apply">("my");
  const [eligibility, setEligibility] = useState<LoanEligibility | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [loansData, eligData] = await Promise.allSettled([
        request<{ loans?: Loan[] } | Loan[]>("/loans/my"),
        request<LoanEligibility>("/loans/eligibility"),
      ]);
      if (loansData.status === "fulfilled") {
        const d = loansData.value;
        setLoans(Array.isArray(d) ? d : (d as any).loans ?? []);
      }
      if (eligData.status === "fulfilled") setEligibility(eligData.value as LoanEligibility);
    } catch {}
  }, [request]);

  useEffect(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  async function handleApply() {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("Erè", "Antre yon montan valid");
      return;
    }
    if (!purpose.trim()) {
      Alert.alert("Erè", "Eksplike poukisa ou bezwen prè a");
      return;
    }
    setApplying(true);
    try {
      await request("/loans/apply", {
        method: "POST",
        body: JSON.stringify({ amount: parseFloat(amount), purpose: purpose.trim() }),
      });
      Alert.alert("Siksè!", "Demann prè ou a voye. Nou pral revize li.", [
        { text: "OK", onPress: () => { setTab("my"); fetchData(); } },
      ]);
      setAmount(""); setPurpose("");
    } catch (e: any) {
      Alert.alert("Erè", e?.message ?? "Erè aplikasyon");
    } finally {
      setApplying(false);
    }
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (loading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>🏛 Demande de Prêt</Text>
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(["my", "apply"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "my" ? `Mes Prêts (${loans.length})` : "Nouvelle Demande"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "my" ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {eligibility && (
            <View style={[styles.eligCard, { backgroundColor: eligibility.eligible ? "#22C55E11" : "#EF444411", borderColor: eligibility.eligible ? "#22C55E44" : "#EF444444" }]}>
              <Feather name={eligibility.eligible ? "check-circle" : "alert-circle"} size={20} color={eligibility.eligible ? "#22C55E" : "#EF4444"} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.eligTitle, { color: colors.foreground }]}>
                  {eligibility.eligible ? "Ou kalifye pou yon prè" : "Ou pa kalifye kounye a"}
                </Text>
                {eligibility.maxAmount && (
                  <Text style={[styles.eligSub, { color: colors.mutedForeground }]}>
                    Maksimòm: ${Number(eligibility.maxAmount).toFixed(2)}
                  </Text>
                )}
                {eligibility.reason && !eligibility.eligible && (
                  <Text style={[styles.eligSub, { color: "#EF4444" }]}>{eligibility.reason}</Text>
                )}
              </View>
              {eligibility.creditScore != null && (
                <Text style={[styles.score, { color: eligibility.eligible ? "#22C55E" : "#EF4444" }]}>
                  {eligibility.creditScore}
                </Text>
              )}
            </View>
          )}

          {loans.length === 0 ? (
            <View style={[styles.center, { flex: undefined, paddingVertical: 40 }]}>
              <Text style={{ fontSize: 48 }}>🏛</Text>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Okenn prè</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Ou pako gen okenn demann prè</Text>
              {eligibility?.eligible && (
                <Pressable style={[styles.applyBtn, { backgroundColor: colors.accent }]} onPress={() => setTab("apply")}>
                  <Text style={styles.applyBtnText}>Fè yon Demann</Text>
                </Pressable>
              )}
            </View>
          ) : (
            loans.map((loan) => {
              const statusColor = STATUS_COLORS[loan.status] ?? "#94A3B8";
              return (
                <View key={loan.id} style={[styles.loanCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.loanTop}>
                    <View>
                      <Text style={[styles.loanAmount, { color: colors.foreground }]}>${Number(loan.amount).toFixed(2)}</Text>
                      {loan.purpose && <Text style={[styles.loanPurpose, { color: colors.mutedForeground }]} numberOfLines={1}>{loan.purpose}</Text>}
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
                      <Text style={[styles.statusText, { color: statusColor }]}>{loan.status}</Text>
                    </View>
                  </View>
                  {loan.remainingBalance != null && loan.remainingBalance > 0 && (
                    <View style={[styles.loanBalance, { borderTopColor: colors.border }]}>
                      <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>Balans ki rete:</Text>
                      <Text style={[styles.balanceValue, { color: "#EF4444" }]}>${Number(loan.remainingBalance).toFixed(2)}</Text>
                    </View>
                  )}
                  <Text style={[styles.loanDate, { color: colors.mutedForeground, borderTopColor: colors.border }]}>
                    {new Date(loan.createdAt).toLocaleDateString("fr-FR")}
                    {loan.dueDate ? ` · Limit: ${new Date(loan.dueDate).toLocaleDateString("fr-FR")}` : ""}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 80 }}>
          {!eligibility?.eligible ? (
            <View style={[styles.center, { flex: undefined, paddingVertical: 40 }]}>
              <Feather name="alert-circle" size={52} color="#EF4444" />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Pa Kalifye</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>{eligibility?.reason ?? "Ou pa satisfè kondisyon yo pou yon prè kounye a."}</Text>
            </View>
          ) : (
            <>
              <View style={[styles.infoBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.infoText, { color: colors.foreground }]}>
                  💡 Ou ka mande jiska <Text style={{ fontFamily: "Inter_700Bold" }}>${Number(eligibility?.maxAmount ?? 0).toFixed(2)}</Text>
                </Text>
              </View>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Montan ($) *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="ex: 500"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Poukisa ou bezwen prè a? *</Text>
                <TextInput
                  style={[styles.input, styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={purpose}
                  onChangeText={setPurpose}
                  placeholder="Eksplike rezon an (stock, machin, biznis...)"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  maxLength={500}
                />
              </View>
              <Pressable
                style={[styles.submitBtn, { backgroundColor: colors.accent, opacity: applying ? 0.8 : 1 }]}
                onPress={handleApply}
                disabled={applying}
              >
                {applying ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>Voye Demann</Text>}
              </Pressable>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold" },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  eligCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  eligTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  eligSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  score: { fontSize: 22, fontFamily: "Inter_700Bold" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  applyBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  applyBtnText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  loanCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  loanTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 14 },
  loanAmount: { fontSize: 22, fontFamily: "Inter_700Bold" },
  loanPurpose: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  loanBalance: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
  balanceLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  balanceValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  loanDate: { padding: 10, paddingHorizontal: 14, fontSize: 12, fontFamily: "Inter_400Regular", borderTopWidth: 1 },
  infoBox: { padding: 14, borderRadius: 12, borderWidth: 1 },
  infoText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  field: { gap: 8 },
  fieldLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textArea: { height: 110, paddingTop: 12 },
  submitBtn: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  submitText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
