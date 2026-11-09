import { ListingCard } from "@/components/ListingCard";
import { StateView } from "@/components/StateView";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type MyListing = {
  id: number;
  title?: string;
  price?: string | number;
  currency?: string;
  images?: string[] | null;
  city?: string | null;
  country?: string | null;
  moderationStatus?: string;
  isBoosted?: boolean;
};

export default function MyListingsScreen() {
  const { token, user, isLoading: authLoading } = useAuth();
  const [listings, setListings] = useState<MyListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useAndroidBack();

  const load = useCallback(async () => {
    if (!token || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/users/${user.id}/listings`, { token, auth: true });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error((data as any).error || `Failed (${res.status})`);
      setListings(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Could not load your listings.");
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  if (!authLoading && (!token || !user)) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.pad}>
          <Text style={styles.brand}>Flexa Market</Text>
          <Text style={styles.title}>My listings</Text>
          <Text style={styles.muted}>Sign in to manage your products.</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/auth/login")}>
            <Text style={styles.primaryText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={20} color="#F8FAFC" />
        </Pressable>
        <Text style={styles.brand}>Flexa Market</Text>
        <Pressable style={styles.iconBtn} onPress={() => router.push("/(tabs)/sell")}>
          <Feather name="plus" size={20} color="#F8FAFC" />
        </Pressable>
      </View>
      <Text style={styles.title}>My listings</Text>

      <StateView loading={loading} error={error} empty={!loading && !error && listings.length === 0} emptyTitle="No listings yet" emptyDetail="Tap + to sell your first item." onRetry={load}>
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <ListingCard item={item} />
              <View style={styles.actions}>
                <Text style={styles.mod}>{item.moderationStatus || "—"}</Text>
                <Pressable onPress={() => router.push(`/sell/edit/${item.id}`)}>
                  <Text style={styles.edit}>Edit</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      </StateView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  pad: { padding: 20, gap: 10 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 16, fontWeight: "800", color: "#F8FAFC" },
  title: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    fontSize: 22,
    fontWeight: "800",
    color: "#F97316",
  },
  muted: { color: "#94A3B8" },
  primary: {
    marginTop: 12,
    backgroundColor: "#F97316",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  list: { paddingHorizontal: 12, paddingBottom: 40 },
  cardWrap: { marginBottom: 8 },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginTop: -4,
    marginBottom: 12,
  },
  mod: { color: "#94A3B8", fontSize: 12, textTransform: "capitalize" },
  edit: { color: "#F97316", fontWeight: "700", fontSize: 13 },
});
