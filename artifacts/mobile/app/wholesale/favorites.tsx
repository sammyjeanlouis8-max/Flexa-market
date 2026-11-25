import { useLanguage } from "@/context/LanguageContext";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import {
  fetchFavorites,
  formatMoney,
  type WholesaleProduct,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleFavoritesScreen() {
  const { t } = useLanguage();
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
        setError("Set your profile country to see favorites in your marketplace.");
        setRows([]);
        return;
      }
      const page = await fetchFavorites({ token, country, limit: 50 });
      setRows(page.products);
    } catch (e: any) {
      setError(e?.message || "Failed to load favorites");
    } finally {
      setLoading(false);
    }
  }, [token, country]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <WholesaleGate>
      <WholesaleShell
        title={t("wholesale_favoritesTitle")}
        subtitle={country ? `Saved in ${country} only` : "Saved wholesale products"}
      >
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>
            No favorites in {country || "your country"} — heart a product from its detail page.
          </Text>
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
                  <View style={[styles.thumb, styles.thumbEmpty]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Text style={styles.meta}>
                    {formatMoney(p.unitPrice, p.currency)} · {p.country || "—"}
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
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: T.mint },
  thumbEmpty: {},
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { marginTop: 2, fontSize: 12, color: T.muted },
  empty: { color: T.muted, fontSize: 14 },
  error: { color: T.danger, fontWeight: "700" },
});
