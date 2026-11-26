import { Feather } from "@expo/vector-icons";
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

  const load = useCallback(
    async (nextCountry = country) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const filter = nextCountry.trim();
        setRows(
          await fetchWarehouses(
            filter
              ? { country: filter, verified: true, limit: 50 }
              : { admin: true, verified: true, limit: 50 },
            { token },
          ),
        );
      } catch (e: any) {
        setError(e?.message || "Failed to load depots");
      } finally {
        setLoading(false);
      }
    },
    [token, country],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_depotsTitle")} subtitle={t("wholesale_depotsSubtitle")}>
        <View style={styles.searchRow}>
          <TextInput
            value={country}
            onChangeText={setCountry}
            placeholder={`${t("wholesale_allCountries")} / Haiti…`}
            placeholderTextColor={T.muted}
            style={styles.search}
            onSubmitEditing={() => void load()}
          />
          <Pressable style={styles.searchBtn} onPress={() => void load()}>
            <Text style={styles.searchBtnText}>Go</Text>
          </Pressable>
        </View>
        {country ? (
          <Pressable
            style={styles.clearFilter}
            onPress={() => {
              setCountry("");
              void load("");
            }}
          >
            <Text style={styles.clearFilterText}>{t("wholesale_allCountries")}</Text>
          </Pressable>
        ) : null}
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="home" size={28} color={T.accent} />
            <Text style={styles.emptyTitle}>{t("wholesale_noDepots")}</Text>
            <Text style={styles.emptyBody}>{t("wholesale_noDepotsBody")}</Text>
            <Pressable
              style={styles.primary}
              onPress={() => router.push("/wholesale/seller/warehouse")}
            >
              <Text style={styles.primaryText}>{t("wholesale_addDepot")}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {rows.map((w) => (
              <Pressable
                key={w.id}
                style={styles.card}
                onPress={() => router.push(`/wholesale/stores/${w.id}` as any)}
                testID={`wholesale-depot-${w.id}`}
              >
                <View style={styles.iconTile}>
                  <Feather name="home" size={20} color={T.accent} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.title}>{w.name}</Text>
                  <View style={styles.metaRow}>
                    <Feather name="map-pin" size={12} color={T.muted} />
                    <Text style={styles.meta}>
                      {w.city} · {w.country}
                    </Text>
                  </View>
                  <Text style={styles.seller}>
                    {w.sellerName || "Seller"} · {w.verificationStatus}
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
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
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
  clearFilter: { marginBottom: 12, alignSelf: "flex-start" },
  clearFilterText: { fontSize: 12, fontWeight: "700", color: T.accent },
  list: { gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: T.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: "800", color: T.ink },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  meta: { fontSize: 13, color: T.muted },
  seller: { marginTop: 6, fontSize: 12, fontWeight: "600", color: T.muted },
  empty: {
    alignItems: "center",
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.line,
    backgroundColor: T.white,
  },
  emptyTitle: { marginTop: 10, fontSize: 15, fontWeight: "800", color: T.ink, textAlign: "center" },
  emptyBody: { marginTop: 6, fontSize: 13, color: T.muted, textAlign: "center", lineHeight: 18 },
  primary: {
    marginTop: 14,
    backgroundColor: T.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryText: { color: T.white, fontWeight: "800", fontSize: 13 },
  error: { color: T.danger, fontWeight: "700" },
});
