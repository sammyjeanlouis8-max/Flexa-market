import { useLanguage } from "@/context/LanguageContext";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchWarehouses, type WholesaleWarehouse } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleCityScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ city?: string }>();
  const cityName = useMemo(() => {
    const raw = Array.isArray(params.city) ? params.city[0] : params.city;
    try {
      return decodeURIComponent(raw || "").trim() || "City";
    } catch {
      return (raw || "City").trim();
    }
  }, [params.city]);

  const [rows, setRows] = useState<WholesaleWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchWarehouses(
        { country: user?.country || undefined, verified: true, limit: 50 },
        { token },
      );
      const needle = cityName.toLowerCase();
      setRows(list.filter((w) => (w.city || "").toLowerCase().includes(needle)));
    } catch (e: any) {
      setError(e?.message || "Failed to load city depots");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, user?.country, cityName]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <WholesaleGate>
      <WholesaleShell
        title={`${cityName} · ${t("wholesale_cityTitle")}`}
        subtitle={t("wholesale_citySubtitle")}
      >
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t("wholesale_depots")}</Text>
            <Text style={styles.statValue}>{loading ? "…" : rows.length}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No verified depots listed for {cityName} yet</Text>
            <Text style={styles.emptyBody}>
              Search the catalog or browse all warehouses. Chat-only wholesale — arrange pickup after you agree in chat.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {rows.map((w) => (
              <Pressable
                key={w.id}
                style={styles.row}
                onPress={() => router.push(`/wholesale/stores/${w.id}` as any)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{w.name}</Text>
                  <Text style={styles.rowMeta}>
                    {w.city}, {w.country}
                    {w.sellerName ? ` · ${w.sellerName}` : ""}
                  </Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{w.city}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.ctas}>
          <Pressable
            style={styles.primary}
            onPress={() =>
              router.push({ pathname: "/wholesale/search", params: { q: cityName } } as any)
            }
          >
            <Text style={styles.primaryText}>Search {cityName} stock</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => router.push("/wholesale/warehouses")}>
            <Text style={styles.secondaryText}>All warehouses</Text>
          </Pressable>
        </View>
      </WholesaleShell>
    </WholesaleGate>
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
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: T.ink },
  rowMeta: { marginTop: 2, fontSize: 12, color: T.muted },
  badge: {
    backgroundColor: T.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: T.accent, textTransform: "uppercase" },
  empty: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.line,
    backgroundColor: T.white,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: T.ink },
  emptyBody: { marginTop: 6, fontSize: 13, color: T.muted, lineHeight: 18 },
  error: { color: T.danger, fontWeight: "700", marginBottom: 12 },
  ctas: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  primary: {
    backgroundColor: T.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryText: { color: T.white, fontWeight: "800", fontSize: 13 },
  secondary: {
    backgroundColor: T.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  secondaryText: { color: T.ink, fontWeight: "800", fontSize: 13 },
});
