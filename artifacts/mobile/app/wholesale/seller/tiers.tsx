import { useLanguage } from "@/context/LanguageContext";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import {
  fetchWholesaleProducts,
  formatMoney,
  type WholesaleProduct,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleSellerTiersScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setProducts(await fetchWholesaleProducts({ mine: true, limit: 50 }, { token }));
    } catch (e: any) {
      setError(e?.message || t("wholesale_failedLoad"));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_tiersTitle")} subtitle={t("wholesale_tiersSubtitle")}>
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : products.length === 0 ? (
          <Text style={styles.empty}>{t("wholesale_sellerEmptyTitle")}</Text>
        ) : (
          <View style={styles.list}>
            {products.map((p) => (
              <Pressable
                key={p.id}
                style={styles.card}
                onPress={() => router.push(`/wholesale/seller/products/${p.id}/edit`)}
                testID={`wholesale-tiers-product-${p.id}`}
              >
                <Text style={styles.title}>{p.title}</Text>
                <Text style={styles.meta}>
                  {formatMoney(p.unitPrice, p.currency)} · {t("wholesale_stock")} {p.stockQuantity}
                </Text>
                {(p.tiers ?? []).length === 0 ? (
                  <Text style={styles.tierEmpty}>No volume tiers yet — edit to add pricing.</Text>
                ) : (
                  <View style={styles.tiers}>
                    {p.tiers.map((tier, i) => (
                      <Text key={tier.id ?? i} style={styles.tier}>
                        {tier.minQuantity}–{tier.maxQuantity ?? "∞"} ·{" "}
                        {formatMoney(tier.unitPrice, p.currency)}
                      </Text>
                    ))}
                  </View>
                )}
                <Text style={styles.editLink}>Edit listing →</Text>
              </Pressable>
            ))}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontSize: 15, fontWeight: "800", color: T.ink },
  meta: { marginTop: 4, fontSize: 12, color: T.muted },
  tiers: { marginTop: 10, gap: 4 },
  tier: {
    fontSize: 13,
    fontWeight: "600",
    color: T.forest,
    backgroundColor: T.accentSoft,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  tierEmpty: { marginTop: 8, fontSize: 12, color: T.muted, fontStyle: "italic" },
  editLink: { marginTop: 10, fontSize: 12, fontWeight: "800", color: T.accent },
  empty: { color: T.muted, fontSize: 14 },
  error: { color: T.danger, fontWeight: "700" },
});
