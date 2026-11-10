/**
 * Seller variation manager.
 * When listing_variants schema is migrated: size/color/price/stock/images per SKU.
 * Until then (schemaReady=false): keep itemSize text editor — PARTIAL.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import type { Listing } from "@/lib/api";
import {
  fetchListingVariants,
  replaceListingVariants,
  type ListingVariant,
} from "@/lib/listingVariantsApi";
import { fetchUserListings, updateListing } from "@/lib/sellerApi";

const SIZE_PRESETS = ["XS", "S", "M", "L", "XL", "XXL", "One size"] as const;
const COLOR_PRESETS = [
  "Black",
  "White",
  "Red",
  "Blue",
  "Green",
  "Yellow",
  "Brown",
  "Gray",
] as const;

type DraftVariant = {
  key: string;
  size: string;
  color: string;
  sku: string;
  price: string;
  stockQuantity: string;
  imageUrl: string;
};

function emptyDraft(): DraftVariant {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    size: "",
    color: "",
    sku: "",
    price: "",
    stockQuantity: "0",
    imageUrl: "",
  };
}

function fromApi(v: ListingVariant): DraftVariant {
  return {
    key: String(v.id ?? `tmp-${Math.random()}`),
    size: v.size ?? "",
    color: v.color ?? "",
    sku: v.sku ?? "",
    price: v.price == null ? "" : String(v.price),
    stockQuantity: String(v.stockQuantity ?? 0),
    imageUrl: Array.isArray(v.images) && v.images[0] ? v.images[0] : "",
  };
}

export default function ProductVariationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ listingId?: string }>();
  const listingIdParam = params.listingId ? Number(params.listingId) : null;
  const { token, user, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(listingIdParam);
  const [schemaReady, setSchemaReady] = useState<boolean | null>(null);
  const [drafts, setDrafts] = useState<DraftVariant[]>([]);
  const [itemSizeDraft, setItemSizeDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadListings = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token || !user?.id) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const list = await fetchUserListings(user.id, { token });
        setRows(list);
        const pick =
          (listingIdParam && list.find((l) => l.id === listingIdParam)?.id) ||
          selectedId ||
          list[0]?.id ||
          null;
        setSelectedId(pick);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load listings");
        setRows((prev) => prev ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token, user?.id, listingIdParam, selectedId],
  );

  const loadVariants = useCallback(
    async (listingId: number) => {
      if (!token) return;
      setBusy(true);
      try {
        const res = await fetchListingVariants(listingId, { token });
        setSchemaReady(res.schemaReady);
        if (res.schemaReady) {
          setDrafts(res.variants.length ? res.variants.map(fromApi) : [emptyDraft()]);
        } else {
          const listing = rows?.find((l) => l.id === listingId);
          setItemSizeDraft(
            String(
              (listing as Listing & { itemSize?: string | null })?.itemSize ?? "",
            ),
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Variants failed");
      } finally {
        setBusy(false);
      }
    },
    [token, rows],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && user?.id) void loadListings("initial");
    }, [authLoading, token, user?.id, router, loadListings]),
  );

  React.useEffect(() => {
    if (selectedId && token) void loadVariants(selectedId);
  }, [selectedId, token, loadVariants]);

  const saveVariants = async () => {
    if (!token || !selectedId) return;
    setBusy(true);
    try {
      if (!schemaReady) {
        const listing = rows?.find((l) => l.id === selectedId);
        const images = Array.isArray(listing?.images) ? listing!.images : [];
        if (!images.length) throw new Error("Listing needs at least one photo");
        await updateListing(
          selectedId,
          { itemSize: itemSizeDraft.trim() || null, images },
          { token },
        );
        Alert.alert(
          "Saved itemSize",
          "Multi-SKU table not migrated yet. Size/color text saved on listing.",
        );
        return;
      }
      const payload: ListingVariant[] = drafts.map((d) => ({
        sku: d.sku.trim() || null,
        size: d.size.trim() || null,
        color: d.color.trim() || null,
        price: d.price.trim() === "" ? null : Number(d.price),
        stockQuantity: Math.max(0, Math.floor(Number(d.stockQuantity) || 0)),
        images: d.imageUrl.trim() ? [d.imageUrl.trim()] : [],
        isActive: true,
      }));
      const res = await replaceListingVariants(selectedId, payload, { token });
      if (res.error) {
        Alert.alert("Save failed", res.error);
        if (res.code === "VARIANTS_SCHEMA_PENDING") setSchemaReady(false);
        return;
      }
      setDrafts(res.variants.map(fromApi));
      Alert.alert("Saved", `${res.variants.length} variant(s) updated.`);
    } catch (e) {
      Alert.alert("Update failed", e instanceof Error ? e.message : "Unknown");
    } finally {
      setBusy(false);
    }
  };

  const selected = rows?.find((l) => l.id === selectedId) ?? null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/(tabs)/sell")
          }
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Product variations</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.banner}>
        {schemaReady === false
          ? "Schema pending approval — editing listing itemSize only (no per-SKU stock/price yet)."
          : schemaReady
            ? "Multi-SKU mode: size, color, price, stock, optional image URL per variant."
            : "Loading variant schema status…"}
      </Text>

      {rows === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 40,
            gap: 12,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadListings("refresh")}
              tintColor="#F97316"
            />
          }
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.section}>Your listings</Text>
          <FlatList
            horizontal
            data={rows ?? []}
            keyExtractor={(i) => String(i.id)}
            showsHorizontalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={styles.empty}>No listings yet.</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.listingChip,
                  selectedId === item.id && styles.listingChipOn,
                ]}
                onPress={() => setSelectedId(item.id)}
              >
                <Text
                  style={[
                    styles.listingChipText,
                    selectedId === item.id && styles.listingChipTextOn,
                  ]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
              </Pressable>
            )}
          />

          {selected && schemaReady === false ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{selected.title}</Text>
              <Text style={styles.hint}>Legacy itemSize text</Text>
              <View style={styles.chipRow}>
                {SIZE_PRESETS.map((s) => (
                  <Pressable
                    key={s}
                    style={styles.chip}
                    onPress={() =>
                      setItemSizeDraft((prev) => {
                        const color = prev.includes("/")
                          ? prev.split("/")[1]?.trim() ?? ""
                          : "";
                        return color ? `${s} / ${color}` : s;
                      })
                    }
                  >
                    <Text style={styles.chipText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.input}
                value={itemSizeDraft}
                onChangeText={setItemSizeDraft}
                placeholder="e.g. M / Blue"
                placeholderTextColor="#94A3B8"
              />
            </View>
          ) : null}

          {selected && schemaReady ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.cardTitle}>{selected.title}</Text>
              {drafts.map((d, idx) => (
                <View key={d.key} style={styles.card} testID={`variant-row-${idx}`}>
                  <Text style={styles.hint}>Variant {idx + 1}</Text>
                  <View style={styles.chipRow}>
                    {SIZE_PRESETS.map((s) => (
                      <Pressable
                        key={s}
                        style={[
                          styles.chip,
                          d.size === s && styles.chipOn,
                        ]}
                        onPress={() =>
                          setDrafts((prev) =>
                            prev.map((x) =>
                              x.key === d.key
                                ? { ...x, size: x.size === s ? "" : s }
                                : x,
                            ),
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.chipText,
                            d.size === s && styles.chipTextOn,
                          ]}
                        >
                          {s}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.chipRow}>
                    {COLOR_PRESETS.map((c) => (
                      <Pressable
                        key={c}
                        style={[
                          styles.chip,
                          d.color === c && styles.chipOn,
                        ]}
                        onPress={() =>
                          setDrafts((prev) =>
                            prev.map((x) =>
                              x.key === d.key
                                ? { ...x, color: x.color === c ? "" : c }
                                : x,
                            ),
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.chipText,
                            d.color === c && styles.chipTextOn,
                          ]}
                        >
                          {c}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    style={styles.input}
                    value={d.sku}
                    onChangeText={(v) =>
                      setDrafts((prev) =>
                        prev.map((x) => (x.key === d.key ? { ...x, sku: v } : x)),
                      )
                    }
                    placeholder="SKU (optional)"
                    placeholderTextColor="#94A3B8"
                  />
                  <View style={styles.row2}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={d.price}
                      onChangeText={(v) =>
                        setDrafts((prev) =>
                          prev.map((x) =>
                            x.key === d.key ? { ...x, price: v } : x,
                          ),
                        )
                      }
                      placeholder="Price (blank=listing)"
                      placeholderTextColor="#94A3B8"
                      keyboardType="decimal-pad"
                    />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={d.stockQuantity}
                      onChangeText={(v) =>
                        setDrafts((prev) =>
                          prev.map((x) =>
                            x.key === d.key
                              ? { ...x, stockQuantity: v }
                              : x,
                          ),
                        )
                      }
                      placeholder="Stock"
                      placeholderTextColor="#94A3B8"
                      keyboardType="number-pad"
                    />
                  </View>
                  <TextInput
                    style={styles.input}
                    value={d.imageUrl}
                    onChangeText={(v) =>
                      setDrafts((prev) =>
                        prev.map((x) =>
                          x.key === d.key ? { ...x, imageUrl: v } : x,
                        ),
                      )
                    }
                    placeholder="Variant image URL (optional)"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                  />
                  <Pressable
                    onPress={() =>
                      setDrafts((prev) => prev.filter((x) => x.key !== d.key))
                    }
                  >
                    <Text style={styles.linkText}>Remove variant</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable
                style={styles.secondary}
                onPress={() => setDrafts((prev) => [...prev, emptyDraft()])}
                testID="btn-add-variant"
              >
                <Text style={styles.secondaryText}>Add variant</Text>
              </Pressable>
            </View>
          ) : null}

          {selected ? (
            <Pressable
              style={[styles.btn, busy && { opacity: 0.7 }]}
              onPress={() => void saveVariants()}
              disabled={busy}
              testID="btn-save-variants"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Save</Text>
              )}
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  banner: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "#FFF7ED",
    borderRadius: 10,
    padding: 10,
    color: "#9A3412",
    fontSize: 12,
    lineHeight: 16,
  },
  section: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
  },
  error: { color: "#DC2626" },
  empty: { color: "#94A3B8", paddingVertical: 8 },
  listingChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginRight: 8,
    maxWidth: 180,
  },
  listingChipOn: { backgroundColor: "#FFF7ED", borderColor: "#FDBA74" },
  listingChipText: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  listingChipTextOn: { color: "#C2410C" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 8,
  },
  cardTitle: { fontWeight: "800", color: "#0F172A", fontSize: 14 },
  hint: { fontSize: 11, color: "#94A3B8", fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#FFF7ED", borderColor: "#FDBA74" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  chipTextOn: { color: "#C2410C" },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  row2: { flexDirection: "row", gap: 8 },
  btn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  secondary: {
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { fontWeight: "800", color: "#0F172A" },
  linkText: { color: "#B91C1C", fontWeight: "700", fontSize: 12 },
});
