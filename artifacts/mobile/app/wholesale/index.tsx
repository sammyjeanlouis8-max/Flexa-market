import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useLanguage } from "@/context/LanguageContext";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { COUNTRY_FLAGS, SUPPORTED_COUNTRIES } from "@/lib/countries";
import {
  fetchWholesaleProductsPage,
  formatMoney,
  type WholesalePagination,
  type WholesaleProduct,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

const PAGE_SIZE = 20;
const GRID_GAP = 12;

export default function WholesaleCatalogScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((width - 32 - GRID_GAP) / 2);

  const [q, setQ] = useState("");
  const [country, setCountry] = useState(user?.country ?? "");
  const [countryOpen, setCountryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [pagination, setPagination] = useState<WholesalePagination | null>(null);

  useEffect(() => {
    if (user?.country && !country) setCountry(user.country);
  }, [user?.country, country]);

  const load = useCallback(
    async (offset = 0, append = false) => {
      if (!token) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await fetchWholesaleProductsPage(
          {
            q: q.trim() || undefined,
            country: country || undefined,
            limit: PAGE_SIZE,
            offset,
          },
          { token },
        );
        setProducts((prev) => (append ? [...prev, ...page.products] : page.products));
        setPagination(page.pagination);
      } catch (e: any) {
        setError(e?.message || "Failed to load");
        if (!append) setProducts([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [token, q, country],
  );

  useEffect(() => {
    void load(0, false);
  }, [load]);

  const countryLabel = country
    ? `${COUNTRY_FLAGS[country] ? `${COUNTRY_FLAGS[country]} ` : ""}${country}`
    : t("wholesale_allCountries");

  const leadText = country
    ? `Wholesale only — chat vendors stocking a verified warehouse in ${country}.`
    : t("wholesale_tagline");

  return (
    <WholesaleGate>
      <WholesaleShell
        headerRight={
          <Pressable
            style={styles.sellBtn}
            onPress={() => router.push("/wholesale/seller/new")}
            testID="wholesale-sell-cta"
          >
            <Feather name="plus" size={14} color={T.forest} />
            <Text style={styles.sellBtnText}>{t("wholesale_sellCta")}</Text>
          </Pressable>
        }
      >
        <Text style={styles.lead}>{leadText}</Text>
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{t("wholesale_modelNote")}</Text>
        </View>

        <View style={styles.chips}>
          {[
            { label: t("wholesale_categoriesTitle"), href: "/wholesale/categories" },
            { label: t("wholesale_depotsTitle"), href: "/wholesale/warehouses" },
            { label: t("wholesale_searchTitle"), href: "/wholesale/search" },
            { label: t("wholesale_helpTitle"), href: "/wholesale/help" },
            { label: "Haiti", href: "/wholesale/country/Haiti" },
          ].map((c) => (
            <Pressable key={c.href} style={styles.chip} onPress={() => router.push(c.href as any)}>
              <Text style={styles.chipText}>{c.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.searchRow}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t("wholesale_searchPlaceholder")}
            placeholderTextColor={T.muted}
            style={styles.search}
            returnKeyType="search"
            onSubmitEditing={() => void load(0, false)}
            testID="wholesale-search-input"
          />
          <Pressable style={styles.searchBtn} onPress={() => void load(0, false)}>
            <Feather name="search" size={18} color={T.white} />
          </Pressable>
        </View>

        <Pressable
          style={styles.countryBtn}
          onPress={() => setCountryOpen(true)}
          testID="wholesale-country-filter"
        >
          <Feather name="globe" size={16} color={T.accent} />
          <Text style={styles.countryBtnText} numberOfLines={1}>
            {countryLabel}
          </Text>
          <Feather name="chevron-down" size={16} color={T.muted} />
        </Pressable>

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : products.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="package" size={28} color={T.accent} />
            <Text style={styles.emptyTitle}>{t("wholesale_emptyTitle")}</Text>
            <Text style={styles.emptyBody}>{t("wholesale_emptyBody")}</Text>
            <Pressable style={styles.primary} onPress={() => router.push("/wholesale/seller/new")}>
              <Text style={styles.primaryText}>+ {t("wholesale_createFirst")}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.grid}>
            {products.map((p) => (
              <Pressable
                key={p.id}
                style={[styles.card, { width: cardWidth }]}
                onPress={() => router.push(`/wholesale/products/${p.id}`)}
                testID={`wholesale-product-${p.id}`}
              >
                <View style={styles.thumbWrap}>
                  {p.images?.[0] ? (
                    <Image source={{ uri: p.images[0] }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Feather name="package" size={28} color={T.accent} />
                    </View>
                  )}
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>{t("wholesale_bulkBadge").toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {p.title}
                </Text>
                <Text style={styles.price}>
                  {formatMoney(p.unitPrice, p.currency)} / {p.wholesaleUnitType}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {t("wholesale_minOrder")} {p.minOrderQty} · {p.sellerName || "Seller"}
                </Text>
                {p.warehouseName ? (
                  <Text style={styles.depot} numberOfLines={1}>
                    {p.warehouseName}
                    {p.warehouseCity ? ` · ${p.warehouseCity}` : ""}
                  </Text>
                ) : null}
              </Pressable>
            ))}
            {pagination?.hasMore ? (
              <Pressable
                style={[styles.loadMore, { width: "100%" }]}
                onPress={() => void load(products.length, true)}
                disabled={loadingMore}
                testID="wholesale-load-more"
              >
                {loadingMore ? (
                  <ActivityIndicator color={T.forest} />
                ) : (
                  <Text style={styles.loadMoreText}>
                    Load more ({products.length}/{pagination.total})
                  </Text>
                )}
              </Pressable>
            ) : pagination ? (
              <Text style={[styles.footer, { width: "100%" }]}>
                Showing {products.length} of {pagination.total}
                {country ? ` · ${country}` : ""}
              </Text>
            ) : null}
          </View>
        )}

        <Text style={styles.footer}>{t("wholesale_nativeNote")}</Text>
      </WholesaleShell>

      <Modal
        visible={countryOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCountryOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setCountryOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t("wholesale_allCountries")}</Text>
            <FlatList
              data={["", ...SUPPORTED_COUNTRIES]}
              keyExtractor={(item) => item || "__all__"}
              renderItem={({ item }) => {
                const selected = item === country;
                const label = item
                  ? `${COUNTRY_FLAGS[item] ? `${COUNTRY_FLAGS[item]} ` : ""}${item}`
                  : t("wholesale_allCountries");
                return (
                  <Pressable
                    style={styles.countryRow}
                    onPress={() => {
                      setCountry(item);
                      setCountryOpen(false);
                    }}
                  >
                    <Text style={styles.countryName}>{label}</Text>
                    {selected ? <Feather name="check" size={18} color={T.accent} /> : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </Pressable>
      </Modal>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 14, color: T.ink, fontWeight: "600", marginBottom: 10 },
  banner: {
    backgroundColor: T.accentSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  bannerText: { color: T.accent, fontSize: 12, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    backgroundColor: T.white,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  chipText: { fontSize: 12, fontWeight: "700", color: T.ink },
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  search: {
    flex: 1,
    backgroundColor: T.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: T.ink,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  searchBtn: {
    width: 46,
    borderRadius: 12,
    backgroundColor: T.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  countryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: T.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  countryBtnText: { flex: 1, fontSize: 14, fontWeight: "700", color: T.ink },
  sellBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: T.white,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  sellBtnText: { color: T.forest, fontSize: 11, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP },
  card: {
    backgroundColor: T.white,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  thumbWrap: { position: "relative" },
  thumb: { width: "100%", height: 120, backgroundColor: T.mint },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  tag: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: T.forest,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: { color: T.white, fontSize: 9, fontWeight: "800" },
  cardTitle: { paddingHorizontal: 10, paddingTop: 8, fontSize: 13, fontWeight: "800", color: T.ink },
  price: { paddingHorizontal: 10, marginTop: 4, fontSize: 13, fontWeight: "800", color: T.accent },
  meta: { paddingHorizontal: 10, marginTop: 2, fontSize: 11, color: T.muted },
  depot: { paddingHorizontal: 10, paddingBottom: 10, marginTop: 4, fontSize: 11, color: T.muted },
  loadMore: {
    marginTop: 4,
    backgroundColor: T.mint,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  loadMoreText: { color: T.forest, fontWeight: "800" },
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
  error: { color: T.danger, marginTop: 16, fontWeight: "700" },
  footer: { marginTop: 24, textAlign: "center", fontSize: 11, color: T.muted },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "70%",
    backgroundColor: T.white,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 16,
    paddingBottom: 24,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: T.ink,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
  },
  countryName: { flex: 1, fontSize: 15, fontWeight: "600", color: T.ink },
});
