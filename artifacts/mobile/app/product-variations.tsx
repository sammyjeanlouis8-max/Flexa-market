/**
 * Product size/color helper — uses existing listing `itemSize` text field only.
 * Multi-SKU / inventory variants are NOT in the backend API; this screen stays
 * PARTIALLY_NATIVE until a verified SKU contract exists.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import type { Listing } from "@/lib/api";
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

function parseItemSize(raw: string): { size: string; color: string; rest: string } {
  const text = raw.trim();
  if (!text) return { size: "", color: "", rest: "" };
  const parts = text.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { size: parts[0]!, color: parts[1]!, rest: parts.slice(2).join(" / ") };
  }
  if (SIZE_PRESETS.some((s) => s.toLowerCase() === text.toLowerCase())) {
    return { size: text, color: "", rest: "" };
  }
  if (COLOR_PRESETS.some((c) => c.toLowerCase() === text.toLowerCase())) {
    return { size: "", color: text, rest: "" };
  }
  return { size: "", color: "", rest: text };
}

function composeItemSize(size: string, color: string, rest: string): string {
  const chunks = [size.trim(), color.trim(), rest.trim()].filter(Boolean);
  if (size.trim() && color.trim() && !rest.trim()) {
    return `${size.trim()} / ${color.trim()}`;
  }
  return chunks.join(" / ");
}

type Draft = { size: string; color: string; rest: string };

export default function ProductVariationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token || !user?.id) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const list = await fetchUserListings(user.id, { token });
        setRows(list);
        const next: Record<number, Draft> = {};
        for (const l of list) {
          next[l.id] = parseItemSize(
            String((l as Listing & { itemSize?: string | null }).itemSize ?? ""),
          );
        }
        setDrafts(next);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load listings");
        setRows((prev) => prev ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token, user?.id],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && user?.id) void load("initial");
    }, [authLoading, token, user?.id, router, load]),
  );

  const patchDraft = (id: number, patch: Partial<Draft>) => {
    setDrafts((prev) => {
      const cur = prev[id] ?? { size: "", color: "", rest: "" };
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  };

  const save = async (listing: Listing) => {
    if (!token) return;
    const draft = drafts[listing.id] ?? { size: "", color: "", rest: "" };
    const itemSize = composeItemSize(draft.size, draft.color, draft.rest) || null;
    setBusyId(listing.id);
    try {
      const images = Array.isArray(listing.images) ? listing.images : [];
      if (!images.length) {
        throw new Error("Listing needs at least one photo before updating size");
      }
      await updateListing(listing.id, { itemSize, images }, { token });
      Alert.alert(
        "Saved",
        "Stored in listing itemSize (single text field). Multi-SKU stock is not available yet.",
      );
      await load("refresh");
    } catch (e) {
      Alert.alert("Update failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/(tabs)/sell")
          }
          testID="btn-variations-back"
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Size / color</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.banner}>
        Backend supports one optional `itemSize` string per listing (e.g. “M /
        Blue”). Independent SKU inventory, stock-per-variant, and cart line SKUs
        are not available — this screen stays partially native until that API
        exists. Presets only compose the same text field.
      </Text>

      {rows === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={rows ?? []}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor="#F97316"
            />
          }
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 24,
          }}
          ListHeaderComponent={
            error ? <Text style={styles.error}>{error}</Text> : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No listings yet. Create one from Sell.</Text>
          }
          renderItem={({ item }) => {
            const draft = drafts[item.id] ?? {
              size: "",
              color: "",
              rest: "",
            };
            const preview = composeItemSize(draft.size, draft.color, draft.rest);
            return (
              <View style={styles.card} testID={`card-variation-${item.id}`}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.section}>Size presets</Text>
                <View style={styles.chipRow}>
                  {SIZE_PRESETS.map((s) => (
                    <Pressable
                      key={s}
                      style={[
                        styles.chip,
                        draft.size.toLowerCase() === s.toLowerCase() &&
                          styles.chipOn,
                      ]}
                      onPress={() =>
                        patchDraft(item.id, {
                          size:
                            draft.size.toLowerCase() === s.toLowerCase()
                              ? ""
                              : s,
                        })
                      }
                      testID={`chip-size-${s}`}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          draft.size.toLowerCase() === s.toLowerCase() &&
                            styles.chipTextOn,
                        ]}
                      >
                        {s}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.section}>Color presets</Text>
                <View style={styles.chipRow}>
                  {COLOR_PRESETS.map((c) => (
                    <Pressable
                      key={c}
                      style={[
                        styles.chip,
                        draft.color.toLowerCase() === c.toLowerCase() &&
                          styles.chipOn,
                      ]}
                      onPress={() =>
                        patchDraft(item.id, {
                          color:
                            draft.color.toLowerCase() === c.toLowerCase()
                              ? ""
                              : c,
                        })
                      }
                      testID={`chip-color-${c}`}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          draft.color.toLowerCase() === c.toLowerCase() &&
                            styles.chipTextOn,
                        ]}
                      >
                        {c}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  style={styles.input}
                  value={draft.rest}
                  onChangeText={(v) => patchDraft(item.id, { rest: v })}
                  placeholder="Extra note (optional)"
                  placeholderTextColor="#94A3B8"
                  testID={`input-variation-rest-${item.id}`}
                />
                <Text style={styles.preview}>
                  Saved as itemSize: {preview || "—"}
                </Text>
                <View style={styles.row}>
                  <Pressable
                    style={styles.btn}
                    disabled={busyId === item.id}
                    onPress={() => void save(item)}
                    testID={`btn-save-variation-${item.id}`}
                  >
                    <Text style={styles.btnText}>
                      {busyId === item.id ? "Saving…" : "Save"}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.link}
                    onPress={() => router.push(`/edit-listing/${item.id}`)}
                  >
                    <Text style={styles.linkText}>Edit listing</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
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
  error: { color: "#DC2626", marginBottom: 8 },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  cardTitle: { fontWeight: "800", color: "#0F172A", fontSize: 14 },
  section: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
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
  preview: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  btn: {
    backgroundColor: "#F97316",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  btnText: { color: "#fff", fontWeight: "800" },
  link: { paddingVertical: 8 },
  linkText: { color: "#F97316", fontWeight: "700" },
});
