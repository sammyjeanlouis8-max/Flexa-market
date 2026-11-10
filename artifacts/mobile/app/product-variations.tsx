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

export default function ProductVariationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
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
        const next: Record<number, string> = {};
        for (const l of list) {
          next[l.id] = String((l as Listing & { itemSize?: string | null }).itemSize ?? "");
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

  const save = async (listing: Listing) => {
    if (!token) return;
    const itemSize = (drafts[listing.id] ?? "").trim() || null;
    setBusyId(listing.id);
    try {
      const images = Array.isArray(listing.images) ? listing.images : [];
      if (!images.length) {
        throw new Error("Listing needs at least one photo before updating size");
      }
      await updateListing(listing.id, { itemSize, images }, { token });
      Alert.alert("Saved", "Size/color text updated (single itemSize field).");
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
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/sell"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Size / color</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.banner}>
        Backend supports one optional `itemSize` string per listing (e.g. “M / Blue”). Independent
        SKU inventory, stock-per-variant, and cart line SKUs are not available yet — this screen is
        partially native until that API exists.
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
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={<Text style={styles.empty}>No listings yet. Create one from Sell.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <TextInput
                style={styles.input}
                value={drafts[item.id] ?? ""}
                onChangeText={(v) => setDrafts((prev) => ({ ...prev, [item.id]: v }))}
                placeholder="e.g. L / Red"
                placeholderTextColor="#94A3B8"
              />
              <View style={styles.row}>
                <Pressable
                  style={styles.btn}
                  disabled={busyId === item.id}
                  onPress={() => void save(item)}
                >
                  <Text style={styles.btnText}>{busyId === item.id ? "Saving…" : "Save"}</Text>
                </Pressable>
                <Pressable
                  style={styles.link}
                  onPress={() => router.push(`/edit-listing/${item.id}`)}
                >
                  <Text style={styles.linkText}>Edit listing</Text>
                </Pressable>
              </View>
            </View>
          )}
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
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
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
