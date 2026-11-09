import { useAuth } from "@/context/AuthContext";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ListingDetail = {
  id: number;
  title?: string;
  description?: string;
  price?: string | number;
  currency?: string;
  city?: string | null;
  location?: string | null;
  country?: string | null;
  condition?: string | null;
  images?: string[] | null;
  sellerName?: string | null;
  isOwner?: boolean;
};

function formatPrice(price: string | number | undefined, currency?: string): string {
  const value = typeof price === "number" ? price : parseFloat(String(price ?? "0"));
  const amount = Number.isFinite(value) ? value.toLocaleString() : "0";
  const code = (currency || "USD").toUpperCase();
  if (code === "HTG") return `G ${amount}`;
  if (code === "DOP") return `RD$ ${amount}`;
  return `$ ${amount}`;
}

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/listings/${id}`, {
          token,
          auth: Boolean(token),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Listing unavailable (${res.status})`);
        }
        const data = await res.json();
        if (!cancelled) setListing(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load listing.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  const hero = resolveMediaUrl(listing?.images?.[0] ?? null);

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
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#F97316" size="large" />
        </View>
      ) : error || !listing ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error || "Listing not found."}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {hero ? (
            <Image source={{ uri: hero }} style={styles.hero} contentFit="cover" />
          ) : (
            <View style={[styles.hero, styles.heroFallback]}>
              <Feather name="image" size={40} color="#64748B" />
            </View>
          )}
          <Text style={styles.price}>{formatPrice(listing.price, listing.currency)}</Text>
          <Text style={styles.title}>{listing.title}</Text>
          <Text style={styles.meta}>
            {[listing.condition, listing.city || listing.location, listing.country]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {listing.sellerName ? (
            <Text style={styles.seller}>Seller: {listing.sellerName}</Text>
          ) : null}
          <Text style={styles.section}>Description</Text>
          <Text style={styles.body}>{listing.description || "No description provided."}</Text>
          <Text style={styles.note}>
            Checkout and messaging native waves come next. Digital goods stay blocked on Android
            until Play Billing is authorized.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 16, fontWeight: "800", color: "#F8FAFC" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  error: { color: "#FCA5A5", textAlign: "center" },
  content: { paddingBottom: 40 },
  hero: { width: "100%", height: 280, backgroundColor: "#1E293B" },
  heroFallback: { alignItems: "center", justifyContent: "center" },
  price: {
    marginTop: 16,
    marginHorizontal: 16,
    fontSize: 24,
    fontWeight: "800",
    color: "#F97316",
  },
  title: {
    marginHorizontal: 16,
    marginTop: 6,
    fontSize: 20,
    fontWeight: "700",
    color: "#F8FAFC",
  },
  meta: { marginHorizontal: 16, marginTop: 6, color: "#94A3B8", fontSize: 13 },
  seller: { marginHorizontal: 16, marginTop: 8, color: "#CBD5E1", fontSize: 13 },
  section: {
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
    fontSize: 15,
    fontWeight: "700",
    color: "#F8FAFC",
  },
  body: { marginHorizontal: 16, color: "#CBD5E1", fontSize: 14, lineHeight: 22 },
  note: {
    marginHorizontal: 16,
    marginTop: 24,
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
  },
});
