import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { decideBoost, fetchAdminBoosts } from "@/lib/adminApi";
import { isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminBoostsScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [country, setCountry] = useState<string>(isSuperAdminUser(user) ? "all" : "");
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setRows(
        await fetchAdminBoosts({
          token,
          status: status === "all" ? undefined : status,
          country: country === "all" || !country ? (country === "all" ? "all" : undefined) : country,
        }),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
      setRows((p) => p ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [token, status, country, t]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoading && !token) { router.replace("/auth/login"); return; }
      if (token && !user?.isAdmin && !isSuperAdminUser(user)) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  return (
    <AdminShell
      title={t("adminBoosts")}
      loading={rows === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); void load(); }}
    >
      <Text style={adminStyles.cardSub}>{t("adminBoostBillingNote")}</Text>
      {isSuperAdminUser(user) ? (
        <View style={[adminStyles.row, { flexWrap: "wrap" }]}>
          {["all", "HT", "DO", "US"].map((c) => (
            <Pressable
              key={c}
              style={[adminStyles.chip, country === c && adminStyles.chipOn]}
              onPress={() => setCountry(c)}
            >
              <Text style={[adminStyles.chipText, country === c && adminStyles.chipTextOn]}>
                {c === "all" ? t("adminAllCountries") : c}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={[adminStyles.row, { flexWrap: "wrap" }]}>
        {["all", "pending", "paid", "failed", "refunded"].map((s) => (
          <Pressable
            key={s}
            style={[adminStyles.chip, status === s && adminStyles.chipOn]}
            onPress={() => setStatus(s)}
          >
            <Text style={[adminStyles.chipText, status === s && adminStyles.chipTextOn]}>{s}</Text>
          </Pressable>
        ))}
      </View>
      {(rows ?? []).map((b) => (
        <View key={b.id} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{b.listingTitle || `Boost #${b.id}`}</Text>
          <Text style={adminStyles.cardSub}>
            {b.plan} · {b.price} · {b.paymentStatus} · {b.listingCountry || "—"}
          </Text>
          <Text style={adminStyles.cardSub}>{b.sellerName || `seller #${b.sellerId}`}</Text>
          {b.paymentStatus === "pending" ? (
            <View style={[adminStyles.row, { marginTop: 8 }]}>
              <Pressable
                style={adminStyles.btn}
                onPress={() =>
                  token &&
                  void decideBoost(b.id, "approve", { token })
                    .then(load)
                    .catch((e) => Alert.alert(t("adminBoosts"), e.message))
                }
              >
                <Text style={adminStyles.btnText}>{t("adminApprove")}</Text>
              </Pressable>
              <Pressable
                style={adminStyles.btnGhost}
                onPress={() =>
                  token &&
                  void decideBoost(b.id, "reject", { token, reason: "rejected by admin" })
                    .then(load)
                    .catch((e) => Alert.alert(t("adminBoosts"), e.message))
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
