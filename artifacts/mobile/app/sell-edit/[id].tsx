/**
 * Native edit listing — PUT /api/listings/:id
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import { ListingEditor, type ListingEditorValues } from "@/components/seller/ListingEditor";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { fetchCategories, fetchListing } from "@/lib/api";
import { updateListing, type CreateListingInput } from "@/lib/sellerListingsApi";

export default function SellEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const { country } = useMarketplace();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initial, setInitial] = useState<ListingEditorValues | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) router.replace("/auth/login");
    }, [authLoading, token, router]),
  );

  useEffect(() => {
    if (!token || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [listing, cats] = await Promise.all([
          fetchListing(id, { token }),
          fetchCategories({ token }),
        ]);
        const slug = (listing as any).categorySlug as string | undefined;
        const catName = listing.category as string | undefined;
        const flat = Array.isArray(cats) ? cats : [];
        const match =
          flat.find((c: any) => c.slug === slug) ||
          flat.find((c: any) => c.name === catName) ||
          null;
        const cond = String(listing.condition || "good") as CreateListingInput["condition"];
        const currency = (String(listing.currency || "USD") as CreateListingInput["currency"]) || "USD";
        if (!cancelled) {
          setInitial({
            title: listing.title || "",
            description: listing.description || "",
            price: String(listing.price ?? ""),
            currency: currency === "HTG" || currency === "DOP" || currency === "USD" ? currency : "USD",
            categoryId: match?.id ?? null,
            condition: ["new", "like_new", "good", "fair", "poor"].includes(cond) ? cond : "good",
            city: listing.city || listing.location || "",
            country: listing.country || country || "Haiti",
            images: listing.images || [],
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load listing");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, id, country]);

  const onSubmit = async (payload: CreateListingInput) => {
    if (!token || !id) return;
    setBusy(true);
    try {
      await updateListing(id, payload, { token });
      Alert.alert("Saved", "Listing updated.", [
        { text: "OK", onPress: () => router.replace("/my-listings") },
      ]);
    } catch (e) {
      Alert.alert("Update failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  const header = useMemo(
    () => <AppHeader title="Edit listing" showBrand={false} showBack showCart={false} />,
    [],
  );

  if (!token) return <View style={styles.root} />;

  return (
    <View style={styles.root}>
      {header}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : error || !initial ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error || "Listing not found"}</Text>
        </View>
      ) : (
        <ListingEditor
          token={token}
          initial={initial}
          submitLabel="Save changes"
          busy={busy}
          onSubmit={onSubmit}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  error: { color: "#B91C1C", textAlign: "center" },
});
