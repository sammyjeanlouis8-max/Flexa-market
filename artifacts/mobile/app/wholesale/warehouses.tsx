import { useLanguage } from "@/context/LanguageContext";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchWarehouses, type WholesaleWarehouse } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleWarehousesBrowseScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<WholesaleWarehouse[]>([]);
  const [country, setCountry] = useState(user?.country || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const marketplace = country.trim() || user?.country || "";
      if (!marketplace) {
        setError("Set a marketplace country to browse verified depots.");
        setRows([]);
        return;
      }
      setRows(
        await fetchWarehouses(
          { country: marketplace, verified: true, limit: 50 },
          { token },
        ),
      );
    } catch (e: any) {
      setError(e?.message || "Failed to load depots");
    } finally {
      setLoading(false);
    }
  }, [token, country, user?.country]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_depotsTitle")} subtitle="Verified stock locations by country">
        <View style={styles.searchRow}>
          <TextInput
            value={country}
            onChangeText={setCountry}
            placeholder="Filter by country (e.g. Haiti)"
            placeholderTextColor={T.muted}
            style={styles.search}
            onSubmitEditing={() => void load()}
          />
          <Pressable style={styles.searchBtn} onPress={() => void load()}>
            <Text style={styles.searchBtnText}>Go</Text>
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No verified depots in this country yet.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((w) => (
              <Pressable
                key={w.id}
                style={styles.card}
                onPress={() => router.push(`/wholesale/country/${encodeURIComponent(w.country)}` as any)}
              >
                <Text style={styles.title}>{w.name}</Text>
                <Text style={styles.meta}>
                  {w.city}
                  {w.region ? `, ${w.region}` : ""} · {w.country}
                </Text>
                {w.latitude != null && w.longitude != null ? (
                  <Text style={styles.coords}>
                    {w.latitude.toFixed(3)}, {w.longitude.toFixed(3)}
                  </Text>
                ) : null}
                <Text style={styles.seller}>{w.sellerName || "Seller"}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  search: {
    flex: 1,
    backgroundColor: T.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    color: T.ink,
  },
  searchBtn: {
    backgroundColor: T.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  searchBtnText: { color: T.white, fontWeight: "800" },
  list: { gap: 10 },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontSize: 15, fontWeight: "800", color: T.ink },
  meta: { marginTop: 4, fontSize: 13, color: T.muted },
  coords: { marginTop: 4, fontSize: 11, color: T.muted, fontWeight: "600" },
  seller: { marginTop: 8, fontSize: 12, fontWeight: "700", color: T.forest },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
