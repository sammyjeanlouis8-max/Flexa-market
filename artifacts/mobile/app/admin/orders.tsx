import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAdminOrdersOverview } from "@/lib/adminApi";
import { canAccessAdminCenter, canManageUsersHard, isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminOrdersScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setRows(
        await fetchAdminOrdersOverview({
          token,
          status: status === "all" ? undefined : status,
          search: search.trim() || undefined,
        }),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
      setRows((p) => p ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [token, status, search, t]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoading && !token) { router.replace("/auth/login"); return; }
      if (token && !(canManageUsersHard(user) || isSuperAdminUser(user) || canAccessAdminCenter(user) && user?.isAdmin)) {
        // requireAdmin on API — gate to admin+
        if (!user?.isAdmin && !isSuperAdminUser(user)) {
          router.replace("/admin");
          return;
        }
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  return (
    <AdminShell
      title={t("adminOrders")}
      loading={rows === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); void load(); }}
    >
      <TextInput
        style={adminStyles.search}
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={() => void load()}
        placeholder={t("adminSearchOrders")}
        placeholderTextColor="#94A3B8"
      />
      <View style={[adminStyles.row, { flexWrap: "wrap" }]}>
        {["all", "pending", "paid", "shipped", "delivered", "cancelled", "disputed"].map((s) => (
          <Pressable
            key={s}
            style={[adminStyles.chip, status === s && adminStyles.chipOn]}
            onPress={() => setStatus(s)}
          >
            <Text style={[adminStyles.chipText, status === s && adminStyles.chipTextOn]}>{s}</Text>
          </Pressable>
        ))}
      </View>
      {(rows ?? []).map((o) => (
        <Pressable
          key={o.id}
          style={adminStyles.card}
          onPress={() => router.push(`/orders/${o.id}`)}
        >
          <Text style={adminStyles.cardTitle}>{o.orderRef || `#${o.id}`}</Text>
          <Text style={adminStyles.cardSub}>
            {o.orderStatus} · {o.amount} · {o.listingCountry || "—"}
          </Text>
          <Text style={adminStyles.cardSub}>
            {o.buyerName || "Buyer"} → {o.sellerName || "Seller"}
            {o.listingTitle ? ` · ${o.listingTitle}` : ""}
          </Text>
          {o.deliveryStatus ? (
            <Text style={adminStyles.cardSub}>
              {t("adminDelivery")}: {o.deliveryStatus}
              {o.verificationCode ? ` · PIN set` : ""}
            </Text>
          ) : null}
        </Pressable>
      ))}
      {rows?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
