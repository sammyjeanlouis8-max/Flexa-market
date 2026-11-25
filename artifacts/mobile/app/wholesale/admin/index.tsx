import { useLanguage } from "@/context/LanguageContext";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchAdminOverview } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function AdminWholesaleHome() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchAdminOverview>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAdminOverview({ token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load admin overview");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_adminTitle")} subtitle={t("wholesale_adminSubtitle")}>
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : data ? (
          <>
            <View style={styles.stats}>
              <Stat label="Products" value={data.products.total} />
              <Stat label="Active" value={data.products.active} />
              <Stat label="Pending depots" value={data.warehouses.pending} />
              <Stat label="Sellers" value={data.sellers} />
            </View>
            <Text style={styles.launch}>
              WHOLESALE_PUBLIC_LAUNCH = {String(data.publicLaunch)}
            </Text>
            <View style={styles.list}>
              {[
                { title: "Warehouse verification", href: "/wholesale/admin/warehouses" },
                { title: "Products", href: "/wholesale/admin/products" },
                { title: "Sellers", href: "/wholesale/admin/sellers" },
                { title: "Categories", href: "/wholesale/admin/categories" },
                { title: "Countries", href: "/wholesale/admin/countries" },
                { title: "Reports", href: "/wholesale/admin/reports" },
                { title: "Moderation flags", href: "/wholesale/admin/flags" },
                { title: "Chats", href: "/wholesale/admin/chats" },
              ].map((item) => (
                <Pressable key={item.href} style={styles.row} onPress={() => router.push(item.href as any)}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </WholesaleShell>
    </WholesaleGate>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  stat: {
    flexGrow: 1,
    minWidth: "45%",
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: T.muted,
    textTransform: "uppercase",
  },
  statValue: { marginTop: 4, fontSize: 24, fontWeight: "800", color: T.accent },
  launch: { marginBottom: 12, fontSize: 12, fontWeight: "700", color: T.warn },
  list: { gap: 8 },
  row: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: T.ink },
  error: { color: T.danger, fontWeight: "700" },
});
