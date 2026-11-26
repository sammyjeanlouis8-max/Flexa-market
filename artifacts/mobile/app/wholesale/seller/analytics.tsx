import { useLanguage } from "@/context/LanguageContext";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import {
  fetchSellerStats,
  fetchWarehouses,
  fetchWholesaleProducts,
  formatMoney,
  type WholesaleProduct,
  type WholesaleSellerStats,
  type WholesaleWarehouse,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleSellerAnalyticsScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<WholesaleSellerStats | null>(null);
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [depots, setDepots] = useState<WholesaleWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [s, p, w] = await Promise.all([
        fetchSellerStats({ token }),
        fetchWholesaleProducts({ mine: true, limit: 10 }, { token }),
        fetchWarehouses({ mine: true }, { token }),
      ]);
      setStats(s);
      setProducts(p);
      setDepots(w);
    } catch (e: any) {
      setError(e?.message || t("wholesale_failedLoad"));
      setStats(null);
      setProducts([]);
      setDepots([]);
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const top = products[0];
  const topDepot = depots[0];
  const active = stats?.listings.active ?? products.length;
  const depotCount = stats?.warehouses.total ?? depots.length;

  return (
    <WholesaleGate>
      <WholesaleShell
        title={t("wholesale_analyticsTitle")}
        subtitle={t("wholesale_analyticsSubtitle")}
      >
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <>
            <View style={styles.stats}>
              <Stat label={t("wholesale_listings")} value={active} />
              <Stat label={t("wholesale_depots")} value={depotCount} />
              <Stat label={t("wholesale_model")} value={t("wholesale_chatOnly")} />
              <Stat label="Open chats" value={stats?.openInquiries ?? 0} />
            </View>

            {!top && !topDepot ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>{t("wholesale_noAnalytics")}</Text>
                <Text style={styles.emptyBody}>{t("wholesale_noAnalyticsBody")}</Text>
              </View>
            ) : (
              <View style={styles.list}>
                {top ? (
                  <Pressable
                    style={styles.row}
                    onPress={() => router.push(`/wholesale/products/${top.id}`)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>{t("wholesale_topListing")}</Text>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {top.title}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {formatMoney(top.unitPrice, top.currency)}
                      </Text>
                    </View>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>#1</Text>
                    </View>
                  </Pressable>
                ) : null}
                {topDepot ? (
                  <Pressable
                    style={styles.row}
                    onPress={() => router.push(`/wholesale/stores/${topDepot.id}`)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>{t("wholesale_topDepot")}</Text>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {topDepot.name}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {topDepot.city}
                        {topDepot.country ? ` · ${topDepot.country}` : ""}
                      </Text>
                    </View>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>#1</Text>
                    </View>
                  </Pressable>
                ) : null}
              </View>
            )}

            <View style={styles.tips}>
              <Text style={styles.tipsTitle}>Tips</Text>
              <Text style={styles.tip}>
                Keep stock updated — buyers see availability before they chat.
              </Text>
              <Text style={styles.tip}>
                Add volume tiers so larger MOQs quote a better unit price in chat.
              </Text>
              <Text style={styles.tip}>
                Wholesale is chat-only: close deals in Market chat, not checkout.
              </Text>
            </View>
          </>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
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
  statValue: { marginTop: 4, fontSize: 22, fontWeight: "800", color: T.accent },
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
  rowLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: T.muted,
    textTransform: "uppercase",
  },
  rowTitle: { marginTop: 2, fontSize: 14, fontWeight: "700", color: T.ink },
  rowMeta: { marginTop: 2, fontSize: 12, color: T.muted },
  badge: {
    backgroundColor: T.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: T.accent },
  empty: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.line,
    backgroundColor: T.white,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: T.ink },
  emptyBody: { marginTop: 6, fontSize: 13, color: T.muted, lineHeight: 18 },
  tips: {
    marginTop: 18,
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    gap: 8,
  },
  tipsTitle: { fontSize: 14, fontWeight: "800", color: T.ink },
  tip: { fontSize: 13, color: T.muted, lineHeight: 18 },
  error: { color: T.danger, fontWeight: "700" },
});
