/**
 * Native Sell — create listing via POST /api/listings + image upload.
 * Drafts persist to AsyncStorage (`flexa_sell_draft_v2`) on Back.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import { ListingEditor, type ListingEditorValues } from "@/components/seller/ListingEditor";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { citiesForCountry } from "@/lib/countries";
import { createListing, type CreateListingInput } from "@/lib/sellerListingsApi";

const DRAFT_KEY = "flexa_sell_draft_v2";
const DRAFT_MAX_AGE_MS = 7 * 24 * 3_600_000;

type DraftBlob = ListingEditorValues & { savedAt?: string };

export default function SellScreen() {
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { country } = useMarketplace();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [initial, setInitial] = useState<ListingEditorValues | null>(null);
  const valuesRef = useRef<ListingEditorValues | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
      }
    }, [authLoading, token, router]),
  );

  const listingCountry = user?.country || country || "Haiti";
  const cities = useMemo(() => citiesForCountry(listingCountry), [listingCountry]);

  const buildDefaults = useCallback((): ListingEditorValues => {
    const local = listingCountry === "Haiti" || listingCountry === "Dominican Republic";
    return {
      title: "",
      description: "",
      price: "",
      currency:
        listingCountry === "Dominican Republic"
          ? "DOP"
          : listingCountry === "Haiti"
            ? "HTG"
            : "USD",
      categoryId: null,
      condition: "good",
      city: user?.city || user?.location || cities[0] || "",
      country: listingCountry,
      images: [],
      deliveryMethod: local ? "motorcycle" : null,
    };
  }, [listingCountry, user?.city, user?.location, cities]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const defaults = buildDefaults();
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (raw) {
          const draft = JSON.parse(raw) as DraftBlob;
          const savedAt = draft.savedAt ? new Date(draft.savedAt).getTime() : 0;
          if (savedAt && Date.now() - savedAt > DRAFT_MAX_AGE_MS) {
            await AsyncStorage.removeItem(DRAFT_KEY);
          } else if (draft && typeof draft === "object") {
            const canRestoreCountry =
              !draft.country || draft.country === listingCountry;
            if (cancelled) return;
            setInitial({
              ...defaults,
              title: typeof draft.title === "string" ? draft.title : defaults.title,
              description:
                typeof draft.description === "string"
                  ? draft.description
                  : defaults.description,
              price: typeof draft.price === "string" ? draft.price : defaults.price,
              currency: draft.currency || defaults.currency,
              categoryId:
                typeof draft.categoryId === "number" ? draft.categoryId : defaults.categoryId,
              condition: draft.condition || defaults.condition,
              city: canRestoreCountry && draft.city ? draft.city : defaults.city,
              country: defaults.country,
              images: Array.isArray(draft.images) ? draft.images : defaults.images,
              deliveryMethod: draft.deliveryMethod ?? defaults.deliveryMethod,
            });
            setReady(true);
            return;
          }
        }
      } catch {
        /* ignore corrupt draft */
      }
      if (!cancelled) {
        setInitial(defaults);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildDefaults, listingCountry]);

  const persistDraft = useCallback(async () => {
    const values = valuesRef.current;
    if (!values) return;
    try {
      await AsyncStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ ...values, savedAt: new Date().toISOString() }),
      );
    } catch {
      /* ignore */
    }
  }, []);

  const clearDraft = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const handleBack = useCallback(() => {
    void (async () => {
      await persistDraft();
      if (router.canGoBack()) router.back();
      else router.replace("/");
    })();
  }, [persistDraft, router]);

  const onSubmit = async (payload: CreateListingInput) => {
    if (!token) return;
    setBusy(true);
    try {
      const key = `sell-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const listing = await createListing(payload, { token, idempotencyKey: key });
      await clearDraft();
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
      <AppHeader
        title="Sell"
        showBrand={false}
        showBack
        onBack={handleBack}
        showCart={false}
      />
      {!ready || !initial ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <ListingEditor
          token={token}
          initial={initial}
          submitLabel="Publish listing"
          busy={busy}
          onSubmit={onSubmit}
          onValuesChange={(v) => {
            valuesRef.current = v;
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
