import { useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleProductList } from "@/components/wholesale/WholesaleProductList";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchWholesaleProductsPage, type WholesaleProduct } from "@/lib/wholesaleApi";

export default function CityProductsScreen() {
  const { city } = useLocalSearchParams<{ city: string }>();
  const cityName = decodeURIComponent(String(city || ""));
  const { token, user } = useAuth();
  const country = user?.country || "";
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const load = useCallback(async (nextOffset = 0, append = false) => {
    if (!token) return;
    if (!country) {
      setError("Your account country is required.");
      setLoading(false);
      return;
    }
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const page = await fetchWholesaleProductsPage(
        { country, city: cityName || undefined, limit, offset: nextOffset },
        { token },
      );
      setProducts((prev) => (append ? [...prev, ...page.products] : page.products));
      setHasMore(page.pagination.hasMore);
      setOffset(nextOffset + page.products.length);
    } catch (e: any) {
      setError(e?.message || "Failed to load city products");
      if (!append) setProducts([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [token, country, cityName]);

  useFocusEffect(useCallback(() => { void load(0, false); }, [load]));

  return (
    <WholesaleGate>
      <WholesaleShell title={cityName || "City products"} subtitle={`${country} · verified depot stock`}>
        <WholesaleProductList
          products={products}
          loading={loading}
          error={error}
          empty={`No products in ${cityName || "this city"}.`}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={() => void load(offset, true)}
        />
      </WholesaleShell>
    </WholesaleGate>
  );
}
