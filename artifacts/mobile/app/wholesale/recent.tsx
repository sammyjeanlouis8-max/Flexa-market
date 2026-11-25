import { useLanguage } from "@/context/LanguageContext";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import {
  fetchWholesaleProduct,
  formatMoney,
  type WholesaleProduct,
} from "@/lib/wholesaleApi";
import { loadRecentProductIds } from "@/lib/wholesaleDraft";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleRecentScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const ids = await loadRecentProductIds();
      const products: WholesaleProduct[] = [];
      for (const id of ids.slice(0, 20)) {
        try {
          products.push(await fetchWholesaleProduct(id, { token }));
        } catch {
          /* skip missing */
        }
      }
      setRows(products);
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
      <WholesaleShell title={t("wholesale_recentTitle")} subtitle="Products you opened on this device">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No recently viewed wholesale products.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((p) => (
              <Pressable
                key={p.id}
                style={styles.row}
                onPress={() => router.push(`/wholesale/products/${p.id}`)}
              >
                <Text style={styles.title}>{p.title}</Text>
                <Text style={styles.meta}>
                  {formatMoney(p.unitPrice, p.currency)} · {p.country || "—"}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { marginTop: 2, fontSize: 12, color: T.muted },
  empty: { color: T.muted },
});
