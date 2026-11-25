import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleProductList } from "@/components/wholesale/WholesaleProductList";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchStore, type WholesaleProduct, type WholesaleSellerProfile, type WholesaleWarehouse } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleStoreScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sellerId = Number(id);
  const { token } = useAuth();
  const [sellerName, setSellerName] = useState("");
  const [profile, setProfile] = useState<WholesaleSellerProfile | null>(null);
  const [warehouses, setWarehouses] = useState<WholesaleWarehouse[]>([]);
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const load = useCallback(async (nextOffset = 0, append = false) => {
    if (!token || !Number.isFinite(sellerId)) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await fetchStore(sellerId, { token, limit, offset: nextOffset });
      setSellerName(data.seller.name);
      setProfile(data.profile);
      setWarehouses(data.warehouses);
      setProducts((prev) => (append ? [...prev, ...data.products] : data.products));
      setHasMore(data.pagination.hasMore);
      setOffset(nextOffset + data.products.length);
    } catch (e: any) {
      setError(e?.message || "Failed to load store");
      if (!append) setProducts([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [token, sellerId]);

  useFocusEffect(useCallback(() => { void load(0, false); }, [load]));

  return (
    <WholesaleGate>
      <WholesaleShell
        title={profile?.businessName || sellerName || "Wholesale store"}
        subtitle={profile?.bio || "Chat-only storefront · verified depots"}
      >
        {loading && products.length === 0 ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <>
            {warehouses.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.label}>Depots</Text>
                {warehouses.map((w) => (
                  <Text key={w.id} style={styles.meta}>
                    {w.name} · {w.city}, {w.country}
                  </Text>
                ))}
              </View>
            ) : null}
            <WholesaleProductList
              products={products}
              empty="No active products for this seller in your country."
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={() => void load(offset, true)}
            />
          </>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 14, gap: 4 },
  label: { fontSize: 12, fontWeight: "800", color: T.muted, textTransform: "uppercase" },
  meta: { fontSize: 13, color: T.ink },
  error: { color: T.danger, fontWeight: "700" },
});
