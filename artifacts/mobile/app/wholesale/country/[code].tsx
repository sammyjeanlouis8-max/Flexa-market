import { useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import { Text, StyleSheet } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleProductList } from "@/components/wholesale/WholesaleProductList";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchWholesaleProductsPage, type WholesaleProduct } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function CountryProductsScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { token, user } = useAuth();
  const accountCountry = user?.country || "";
  const requested = decodeURIComponent(String(code || ""));
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const load = useCallback(async (nextOffset = 0, append = false) => {
    if (!token) return;
    if (!accountCountry) {
      setError("Your account country is required.");
      setLoading(false);
      return;
    }
    if (requested && requested.toLowerCase() !== accountCountry.toLowerCase() && !user?.isSuperAdmin) {
      setError(`Catalog is locked to your account country (${accountCountry}).`);
      setProducts([]);
      setLoading(false);
      return;
    }
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const page = await fetchWholesaleProductsPage(
        { country: accountCountry, limit, offset: nextOffset },
        { token },
      );
      setProducts((prev) => (append ? [...prev, ...page.products] : page.products));
      setHasMore(page.pagination.hasMore);
      setOffset(nextOffset + page.products.length);
    } catch (e: any) {
      setError(e?.message || "Failed to load country products");
      if (!append) setProducts([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [token, accountCountry, requested, user?.isSuperAdmin]);

  useFocusEffect(useCallback(() => { void load(0, false); }, [load]));

  return (
    <WholesaleGate>
      <WholesaleShell title={accountCountry || "Country products"} subtitle="Verified warehouse stock in your marketplace country">
        {requested && requested.toLowerCase() !== accountCountry.toLowerCase() ? (
          <Text style={styles.note}>Requested “{requested}” — showing {accountCountry} only.</Text>
        ) : null}
        <WholesaleProductList
          products={products}
          loading={loading}
          error={error}
          empty={`No active products in ${accountCountry || "your country"}.`}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={() => void load(offset, true)}
        />
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  note: { marginBottom: 10, color: T.muted, fontSize: 12 },
});
