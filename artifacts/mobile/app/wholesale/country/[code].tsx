import { useLanguage } from "@/context/LanguageContext";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import {
  fetchWarehouses,
  fetchWholesaleProducts,
  formatMoney,
  type WholesaleProduct,
  type WholesaleWarehouse,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleCountryScreen() {
  const { t } = useLanguage();
  const { code: codeParam } = useLocalSearchParams<{ code: string }>();
  const code = useMemo(() => {
    const raw = Array.isArray(codeParam) ? codeParam[0] : codeParam;
    try {
      return decodeURIComponent(raw || "Haiti");
    } catch {
      return raw || "Haiti";
    }
  }, [codeParam]);

  const { token } = useAuth();
  const router = useRouter();
  const [depots, setDepots] = useState<WholesaleWarehouse[]>([]);
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [w, p] = await Promise.all([
        fetchWarehouses({ country: code, verified: true }, { token }),
        fetchWholesaleProducts({ country: code, limit: 40 }, { token }),
      ]);
      setDepots(w);
      setProducts(p);
    } catch (e: any) {
      setError(e?.message || t("wholesale_failedLoad"));
      setDepots([]);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [token, code, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <WholesaleGate>
      <WholesaleShell
        title={code}
        subtitle="Wholesale vendors with depots in this country."
      >
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t("wholesale_depots")}</Text>
            <Text style={styles.statValue}>{loading ? "…" : depots.length}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t("wholesale_listings")}</Text>
            <Text style={styles.statValue}>{loading ? "…" : products.length}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <>
            <Text style={styles.section}>Verified depots</Text>
            {depots.length === 0 ? (
              <Text style={styles.empty}>No verified warehouses in this country yet.</Text>
            ) : (
              <View style={styles.list}>
                {depots.map((w) => (
                  <Pressable
                    key={w.id}
                    style={styles.row}
                    onPress={() => router.push(`/wholesale/stores/${w.id}`)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{w.name}</Text>
                      <Text style={styles.rowMeta}>
                        {w.city} · {w.sellerName || "Seller"}
                      </Text>
                    </View>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{w.country}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={[styles.section, { marginTop: 18 }]}>Products</Text>
            {products.length === 0 ? (
              <Text style={styles.empty}>No products listed for {code} yet.</Text>
            ) : (
              <View style={styles.list}>
                {products.map((p) => (
                  <Pressable
                    key={p.id}
                    style={styles.row}
                    onPress={() => router.push(`/wholesale/products/${p.id}`)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {p.title}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {formatMoney(p.unitPrice, p.currency)} · {t("wholesale_minOrder")}{" "}
                        {p.minOrderQty}
                      </Text>
                    </View>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{p.city || p.status}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
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
  section: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: "800",
    color: T.ink,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
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
    maxWidth: 100,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: T.accent,
    textTransform: "uppercase",
  },
  empty: { color: T.muted, fontSize: 13, marginBottom: 8 },
  error: { color: T.danger, fontWeight: "700" },
});
