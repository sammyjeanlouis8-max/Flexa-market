import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { formatMoney, type WholesaleProduct } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export function WholesaleProductList({
  products,
  loading,
  error,
  empty,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  products: WholesaleProduct[];
  loading?: boolean;
  error?: string | null;
  empty?: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const router = useRouter();

  if (loading) return <ActivityIndicator color={T.accent} />;
  if (error) return <Text style={styles.error}>{error}</Text>;
  if (products.length === 0) return <Text style={styles.empty}>{empty || "No products found."}</Text>;

  return (
    <View style={styles.list}>
      {products.map((p) => (
        <Pressable
          key={p.id}
          style={styles.row}
          onPress={() => router.push(`/wholesale/products/${p.id}`)}
        >
          {p.images?.[0] ? (
            <Image source={{ uri: p.images[0] }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={styles.thumb} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {p.title}
            </Text>
            <Text style={styles.meta}>
              {formatMoney(p.unitPrice, p.currency)}
              {p.city ? ` · ${p.city}` : ""}
              {p.country ? ` · ${p.country}` : ""}
              {p.featured ? " · Featured" : ""}
            </Text>
          </View>
        </Pressable>
      ))}
      {hasMore && onLoadMore ? (
        <Pressable style={styles.moreBtn} onPress={onLoadMore} disabled={loadingMore}>
          {loadingMore ? (
            <ActivityIndicator color={T.white} />
          ) : (
            <Text style={styles.moreText}>Load more</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  thumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: T.mint },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { marginTop: 2, fontSize: 12, color: T.muted },
  empty: { color: T.muted, fontSize: 14 },
  error: { color: T.danger, fontWeight: "700" },
  moreBtn: {
    marginTop: 8,
    backgroundColor: T.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  moreText: { color: T.white, fontWeight: "800" },
});
