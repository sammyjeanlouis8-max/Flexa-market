import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleProductList } from "@/components/wholesale/WholesaleProductList";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchWholesaleProductsPage, type WholesaleProduct } from "@/lib/wholesaleApi";

export default function FeaturedProductsScreen() {
  const { token, user } = useAuth();
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const country = user?.country || "";
  const limit = 20;

  const load = useCallback(async (nextOffset = 0, append = false) => {
    if (!token) return;
    if (!country) {
      setError("Your account country is required.");
      setProducts([]);
      setLoading(false);
      return;
    }
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const page = await fetchWholesaleProductsPage(
        { featured: true, country, limit, offset: nextOffset },
        { token },
      );
      setProducts((prev) => (append ? [...prev, ...page.products] : page.products));
      setHasMore(page.pagination.hasMore);
      setOffset(nextOffset + page.products.length);
    } catch (e: any) {
      setError(e?.message || "Failed to load featured products");
      if (!append) setProducts([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [token, country]);

  useFocusEffect(useCallback(() => { void load(0, false); }, [load]));

  return (
    <WholesaleGate>
      <WholesaleShell title="Featured products" subtitle={`Highlighted depot stock in ${country || "your country"}`}>
        <WholesaleProductList
          products={products}
          loading={loading}
          error={error}
          empty="No featured products in your country yet."
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={() => void load(offset, true)}
        />
      </WholesaleShell>
    </WholesaleGate>
  );
}
