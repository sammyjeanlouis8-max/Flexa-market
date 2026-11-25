import { useLanguage } from "@/context/LanguageContext";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchWholesaleProducts } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleCategoriesScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const country = user?.country || "";

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (!country) {
        setError("Your account country is required.");
        setCategories([]);
        return;
      }
      const products = await fetchWholesaleProducts({ country, limit: 50 }, { token });
      const map = new Map<string, number>();
      for (const p of products) {
        const key = (p.category || "Uncategorized").trim() || "Uncategorized";
        map.set(key, (map.get(key) || 0) + 1);
      }
      setCategories(
        [...map.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch (e: any) {
      setError(e?.message || "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, [token, country]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const subtitle = useMemo(
    () => (country ? `Categories available in ${country}` : "Browse by category"),
    [country],
  );

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_categoriesTitle")} subtitle={subtitle}>
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : categories.length === 0 ? (
          <Text style={styles.empty}>No categories with verified warehouse stock in {country}.</Text>
        ) : (
          <View style={styles.list}>
            {categories.map((c) => (
              <Pressable
                key={c.name}
                style={styles.row}
                onPress={() =>
                  router.push(`/wholesale/categories/${encodeURIComponent(c.name)}` as any)
                }
              >
                <Text style={styles.title}>{c.name}</Text>
                <Text style={styles.meta}>{c.count}</Text>
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
    justifyContent: "space-between",
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { fontSize: 13, fontWeight: "800", color: T.accent },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
