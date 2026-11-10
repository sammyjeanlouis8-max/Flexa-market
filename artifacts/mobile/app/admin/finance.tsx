/**
 * Finance console — wallets, cashouts, transactions (financeAdmin APIs).
 * No payment secrets or card data exposed.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  fetchAdminCashouts,
  fetchAdminTransactions,
  fetchAdminWalletTransactions,
  fetchAdminWallets,
  reviewCashout,
} from "@/lib/adminApi";
import { canAccessFinance } from "@/lib/adminRoles";

type Tab = "wallets" | "cashouts" | "walletTx" | "transactions";

export default function AdminFinanceScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>("cashouts");
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      let data: any[] = [];
      if (tab === "wallets") data = await fetchAdminWallets({ token });
      if (tab === "cashouts") data = await fetchAdminCashouts({ token });
      if (tab === "walletTx") data = await fetchAdminWalletTransactions({ token, limit: 100 });
      if (tab === "transactions") data = await fetchAdminTransactions({ token });
      setRows(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
      setRows((p) => p ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [token, tab, t]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoading && !token) { router.replace("/auth/login"); return; }
      if (token && !canAccessFinance(user)) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  return (
    <AdminShell
      title={t("adminFinance")}
      loading={rows === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); void load(); }}
    >
      <Text style={adminStyles.cardSub}>{t("adminFinanceNote")}</Text>
      <View style={[adminStyles.row, { flexWrap: "wrap" }]}>
        {(
          [
            ["cashouts", t("adminCashouts")],
            ["wallets", t("adminWallets")],
            ["walletTx", t("adminWalletTx")],
            ["transactions", t("adminTransactions")],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            style={[adminStyles.chip, tab === id && adminStyles.chipOn]}
            onPress={() => setTab(id)}
          >
            <Text style={[adminStyles.chipText, tab === id && adminStyles.chipTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {(rows ?? []).map((r, i) => (
        <View key={r.id ?? r.requestId ?? i} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>
            {tab === "cashouts"
              ? `#${r.id || r.requestId} · ${r.amountUsd ?? r.amount ?? "—"}`
              : tab === "wallets"
                ? `${r.userName || r.name || `user ${r.userId}`} · ${r.balanceUsd ?? r.balance ?? "—"}`
                : `#${r.id} · ${r.amountUsd ?? r.amount ?? "—"} ${r.currency || "USD"}`}
          </Text>
          <Text style={adminStyles.cardSub}>
            {r.status || r.type || r.paymentMethod || ""}
            {r.email ? ` · ${r.email}` : ""}
          </Text>
          {tab === "cashouts" && (r.status === "pending" || r.status === "processing") ? (
            <View style={[adminStyles.row, { marginTop: 8 }]}>
              <Pressable
                style={adminStyles.btn}
                onPress={() =>
                  token &&
                  void reviewCashout(
                    { requestId: Number(r.id || r.requestId), decision: "approve" },
                    { token },
                  )
                    .then(load)
                    .catch((e) => Alert.alert(t("adminFinance"), e.message))
                }
              >
                <Text style={adminStyles.btnText}>{t("adminApprove")}</Text>
              </Pressable>
              <Pressable
                style={adminStyles.btnGhost}
                onPress={() =>
                  token &&
                  void reviewCashout(
                    { requestId: Number(r.id || r.requestId), decision: "reject", note: "rejected" },
                    { token },
                  )
                    .then(load)
                    .catch((e) => Alert.alert(t("adminFinance"), e.message))
                }
              >
                <Text style={adminStyles.btnGhostText}>{t("adminReject")}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
      {rows?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
