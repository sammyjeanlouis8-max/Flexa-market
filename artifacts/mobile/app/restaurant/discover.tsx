import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchRestaurants, type Restaurant } from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

export default function RestaurantDiscoverScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [openNow, setOpenNow] = useState(false);
  const [rows, setRows] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(
        await fetchRestaurants(
          { q: q.trim() || undefined, country: user?.country, openNow, status: "published" },
          { token },
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [token, q, openNow, user?.country]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RestaurantShell title={t("restaurant_discoverTitle")} subtitle={t("restaurant_discoverSubtitle")}>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder={t("restaurant_searchPlaceholder")}
        style={styles.input}
        placeholderTextColor={T.muted}
      />
      <Pressable onPress={() => setOpenNow((v) => !v)} style={[styles.chip, openNow && styles.chipOn]}>
        <Text style={styles.chipText}>{t("restaurant_openNow")}</Text>
      </Pressable>
      {loading ? (
        <ActivityIndicator color={T.accent} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          scrollEnabled={false}
          ListEmptyComponent={<Text style={styles.muted}>{t("restaurant_emptyTitle")}</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/restaurant/${item.id}` as any)}>
              <Text style={styles.title}>{item.name}</Text>
              <Text style={styles.muted}>{item.city}</Text>
            </Pressable>
          )}
        />
      )}
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: T.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginBottom: 8,
  },
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: T.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginBottom: 8,
  },
  chipOn: { backgroundColor: "rgba(26,107,71,0.15)" },
  chipText: { fontWeight: "700", fontSize: 12, color: T.ink },
  card: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontWeight: "800", color: T.ink },
  muted: { color: T.muted, fontSize: 12, marginTop: 4 },
});