/**
 * Reusable Gate + Shell + fetchWholesaleProducts list for catalog-style wholesale screens.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import {
  fetchWholesaleProducts,
  formatMoney,
  type WholesaleProduct,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";
import { WholesaleGate } from "./WholesaleGate";
import { WholesaleShell } from "./WholesaleShell";

export type WholesaleProductListQuery = {
  q?: string;
  country?: string;
  category?: string;
  warehouseId?: number;
  mine?: boolean;
  status?: string;
  limit?: number;
  offset?: number;
};

type Props = {
  title: string;
  subtitle?: string;
  query?: WholesaleProductListQuery;
  empty?: string;
  emptyBody?: string;
  stats?: { label: string; value: string | number }[];
  badge?: string | ((p: WholesaleProduct) => string | undefined);
  /** Override default meta line under the title. */
  renderMeta?: (p: WholesaleProduct) => string;
  onPressProduct?: (p: WholesaleProduct) => void;
  /** Extra content above the product list (depots, tips, etc.). */
  headerSlot?: ReactNode;
  showThumb?: boolean;
  children?: ReactNode;
};

export function WholesaleProductListScreen({
  title,
  subtitle,
  query,
  empty = "No wholesale products yet",
  emptyBody = "Listings from verified depots appear here. Chat-only — no cart.",
  stats,
  badge,
  renderMeta,
  onPressProduct,
  headerSlot,
  showThumb = true,
  children,
}: Props) {
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
      setProducts(await fetchWholesaleProducts(query ?? { limit: 40 }, { token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load products");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [token, query?.q, query?.country, query?.category, query?.warehouseId, query?.mine, query?.status, query?.limit, query?.offset]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const defaultMeta = (p: WholesaleProduct) =>
    [
      formatMoney(p.unitPrice, p.currency),
      p.city || p.country,
      `Min ${p.minOrderQty}`,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <WholesaleGate>
      <WholesaleShell title={title} subtitle={subtitle}>
        {stats?.length ? (
          <View style={styles.stats}>
            {stats.map((s) => (
              <View key={s.label} style={styles.stat}>
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={styles.statValue}>{s.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {headerSlot}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 12 }} />
        ) : products.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="package" size={28} color={T.accent} />
            <Text style={styles.emptyTitle}>{empty}</Text>
            <Text style={styles.emptyBody}>{emptyBody}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {products.map((p) => {
              const b = typeof badge === "function" ? badge(p) : badge ?? p.status;
              return (
                <Pressable
                  key={p.id}
                  style={styles.row}
                  onPress={() => {
                    if (onPressProduct) onPressProduct(p);
                    else router.push(`/wholesale/products/${p.id}`);
                  }}
                  testID={`wholesale-list-product-${p.id}`}
                >
                  {showThumb ? (
                    p.images?.[0] ? (
                      <Image source={{ uri: p.images[0] }} style={styles.thumb} contentFit="cover" />
                    ) : (
                      <View style={[styles.thumb, styles.thumbEmpty]}>
                        <Feather name="package" size={20} color={T.accent} />
                      </View>
                    )
                  ) : null}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {p.title}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={2}>
                      {renderMeta ? renderMeta(p) : defaultMeta(p)}
                    </Text>
                  </View>
                  {b ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{b}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}

        {children}
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
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: T.mint },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 14, fontWeight: "700", color: T.ink },
  rowMeta: { marginTop: 2, fontSize: 12, color: T.muted },
  badge: {
    backgroundColor: T.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: 88,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: T.accent,
    textTransform: "uppercase",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.line,
    borderRadius: 16,
    backgroundColor: T.white,
  },
  emptyTitle: { marginTop: 10, fontSize: 15, fontWeight: "800", color: T.ink },
  emptyBody: {
    marginTop: 6,
    fontSize: 13,
    color: T.muted,
    textAlign: "center",
    lineHeight: 18,
  },
  error: { color: T.danger, fontWeight: "700", marginBottom: 10 },
});
