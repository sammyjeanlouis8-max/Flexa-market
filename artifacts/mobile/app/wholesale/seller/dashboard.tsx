import { useLanguage } from "@/context/LanguageContext";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchSellerStats, type WholesaleSellerStats } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleSellerDashboardScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<WholesaleSellerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setStats(await fetchSellerStats({ token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load dashboard");
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
      <WholesaleShell title={t("wholesale_sellerDashTitle")} subtitle="Depot stock · chats · verified countries">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : stats ? (
          <>
            <View style={styles.stats}>
              <Stat label="Active" value={stats.listings.active} />
              <Stat label="Drafts" value={stats.listings.draft} />
              <Stat label="Verified depots" value={stats.warehouses.verified} />
              <Stat label="Open chats" value={stats.openInquiries} />
            </View>
            {stats.sellableCountries.length ? (
              <Text style={styles.countries}>
                Sellable countries: {stats.sellableCountries.join(", ")}
              </Text>
            ) : (
              <Text style={styles.warn}>
                No verified warehouses yet — register a depot before publishing.
              </Text>
            )}
            <View style={styles.list}>
              {[
                { title: "Add product", meta: "Photo Picker · verified depot", href: "/wholesale/seller/new", icon: "plus" as const },
                { title: "Warehouses", meta: "Multi-country verification", href: "/wholesale/seller/warehouse", icon: "home" as const },
                { title: "Inventory", meta: "Stock by warehouse", href: "/wholesale/seller/inventory", icon: "layers" as const },
                { title: "Drafts", meta: `${stats.listings.draft} unpublished`, href: "/wholesale/seller/drafts", icon: "edit-3" as const },
                { title: "Buyer inquiries", meta: "Quote requests", href: "/wholesale/seller/inquiries", icon: "message-circle" as const },
                { title: "My listings", meta: "Active depot stock", href: "/wholesale/seller", icon: "package" as const },
              ].map((item) => (
                <Pressable key={item.href} style={styles.row} onPress={() => router.push(item.href as any)}>
                  <Feather name={item.icon} size={18} color={T.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowMeta}>{item.meta}</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={T.muted} />
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
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
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
    letterSpacing: 0.4,
  },
  statValue: { marginTop: 4, fontSize: 24, fontWeight: "800", color: T.accent },
  countries: { marginBottom: 12, fontSize: 13, fontWeight: "700", color: T.forest },
  warn: { marginBottom: 12, fontSize: 13, fontWeight: "700", color: T.warn },
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: T.ink },
  rowMeta: { marginTop: 2, fontSize: 12, color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
