import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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

export default function WholesaleCategorySlugScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const category = decodeURIComponent(String(slug || ""));
  const { token, user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const country = user?.country || "";

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (!country) {
        setError("Your account country is required.");
        setRows([]);
        return;
      }
      setRows(
        await fetchWholesaleProducts(
          { country, category, limit: 50 },
          { token },
        ),
      );
    } catch (e: any) {
      setError(e?.message || "Failed to load category");
    } finally {
      setLoading(false);
    }
  }, [token, country, category]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <WholesaleGate>
      <WholesaleShell title={category || "Category"} subtitle={`Verified depots in ${country || "—"}`}>
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No products in this category for {country}.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((p) => (
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
                  <Text style={styles.title}>{p.title}</Text>
                  <Text style={styles.meta}>
                    {formatMoney(p.unitPrice, p.currency)} · MOQ {p.minOrderQty}
                  </Text>
                </View>
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
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
