/**
 * Native seller storefront — public shop matching website /profile/:id.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListingCard } from "@/components/ListingCard";
import { useAuth } from "@/context/AuthContext";
import { getApiBase, type Listing } from "@/lib/api";

type PublicSeller = {
  id: number;
  name: string;
  avatar?: string | null;
  bio?: string | null;
  country?: string | null;
  location?: string | null;
  rating?: number;
  reviewCount?: number;
  isVerified?: boolean;
  listingCount?: number;
  followerCount?: number;
  totalSales?: number;
};

export default function SellerStorefrontScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const sellerId = Number(id);

  const [seller, setSeller] = useState<PublicSeller | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sellerId) {
      setError("Invalid seller");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const [uRes, lRes] = await Promise.all([
        fetch(`${getApiBase()}/users/${sellerId}`, { headers }),
        fetch(`${getApiBase()}/users/${sellerId}/listings`, { headers }),
      ]);
      if (!uRes.ok) throw new Error(`Seller failed (${uRes.status})`);
      const u = await uRes.json();
      setSeller(u);
      if (lRes.ok) {
        const data = await lRes.json();
        setListings(Array.isArray(data) ? data : []);
      } else {
        setListings([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load storefront");
    } finally {
      setLoading(false);
    }
  }, [sellerId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.topTitle}>Seller</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 48 }} />
      ) : error || !seller ? (
        <Text style={styles.message}>{error ?? "Seller not found"}</Text>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} tintColor="#F97316" />
          }
          ListHeaderComponent={
            <View style={styles.headerCard}>
              <View style={styles.avatarRing}>
                {seller.avatar ? (
                  <Image
                    source={{ uri: seller.avatar }}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarPh]}>
                    <Feather name="user" size={28} color="#94A3B8" />
                  </View>
                )}
              </View>
              <Text style={styles.name}>
                {seller.name}
                {seller.isVerified ? " · Verified" : ""}
              </Text>
              <Text style={styles.meta}>
                {[seller.location, seller.country].filter(Boolean).join(" · ")}
              </Text>
              {seller.bio ? (
                <Text style={styles.bio} numberOfLines={3}>
                  {seller.bio}
                </Text>
              ) : null}
              <View style={styles.stats}>
                <View style={styles.stat}>
                  <Text style={styles.statN}>{seller.listingCount ?? listings.length}</Text>
                  <Text style={styles.statL}>Listings</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statN}>{seller.totalSales ?? 0}</Text>
                  <Text style={styles.statL}>Sales</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statN}>{seller.followerCount ?? 0}</Text>
                  <Text style={styles.statL}>Followers</Text>
                </View>
              </View>
              <Text style={styles.section}>Shop</Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.message}>This seller has no active listings.</Text>
          }
          renderItem={({ item }) => <ListingCard item={item} />}
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
    paddingVertical: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  topTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  headerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    alignItems: "center",
    marginBottom: 14,
    gap: 6,
  },
  avatarRing: {
    padding: 3,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#F97316",
    marginBottom: 6,
  },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarPh: {
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  meta: { fontSize: 13, color: "#64748B" },
  bio: { fontSize: 14, color: "#475569", textAlign: "center", marginTop: 4 },
  stats: {
    flexDirection: "row",
    gap: 18,
    marginTop: 10,
    marginBottom: 4,
  },
  stat: { alignItems: "center" },
  statN: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  statL: { fontSize: 11, color: "#94A3B8", fontWeight: "600" },
  section: {
    alignSelf: "flex-start",
    marginTop: 8,
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  row: { justifyContent: "space-between" },
  message: {
    marginTop: 40,
    textAlign: "center",
    color: "#64748B",
    paddingHorizontal: 28,
  },
});
