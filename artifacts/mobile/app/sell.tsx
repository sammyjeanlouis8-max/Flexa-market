/**
 * Native Sell — create listing via POST /api/listings + image upload.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import { ListingEditor, type ListingEditorValues } from "@/components/seller/ListingEditor";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { citiesForCountry } from "@/lib/countries";
import { createListing, type CreateListingInput } from "@/lib/sellerListingsApi";

export default function SellScreen() {
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { country } = useMarketplace();
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
      }
    }, [authLoading, token, router]),
  );

  const listingCountry = user?.country || country || "Haiti";
  const cities = citiesForCountry(listingCountry);
  const initial: ListingEditorValues = useMemo(
    () => ({
      title: "",
      description: "",
      price: "",
      currency: listingCountry === "Dominican Republic" ? "DOP" : listingCountry === "Haiti" ? "HTG" : "USD",
      categoryId: null,
      condition: "good",
      city: user?.city || user?.location || cities[0] || "",
      country: listingCountry,
      images: [],
    }),
    [listingCountry, user?.city, user?.location, cities],
  );

  const onSubmit = async (payload: CreateListingInput) => {
    if (!token) return;
    setBusy(true);
    try {
      const key = `sell-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const listing = await createListing(payload, { token, idempotencyKey: key });
      Alert.alert("Listing submitted", "Your product was created and sent for review.", [
        {
          text: "View listings",
          onPress: () => router.replace("/my-listings"),
        },
        {
          text: "Open listing",
          onPress: () => router.replace(`/listing/${listing.id}`),
        },
      ]);
    } catch (e) {
      Alert.alert("Could not publish", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  if (!token) return <View style={styles.root} />;

  return (
    <View style={styles.root}>
      <AppHeader title="Sell" showBrand={false} showBack showCart={false} />
      <ListingEditor
        token={token}
        initial={initial}
        submitLabel="Publish listing"
        busy={busy}
        onSubmit={onSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
});
