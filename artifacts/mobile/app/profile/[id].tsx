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
import type { Listing } from "@/lib/api";
import {
  fetchPublicUser,
  fetchSellerReviews,
  fetchUserListings,
  type PublicUser,
  type SellerReview,
} from "@/lib/publicShopApi";

export default function PublicShopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [reviews, setReviews] = useState<SellerReview[]>([]);
  const [tab, setTab] = useState<"listings" | "reviews">("listings");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [u, ls, rs] = await Promise.all([
        fetchPublicUser(id, { token }),
        fetchUserListings(id, { token }),
        fetchSellerReviews(id, { token }),
      ]);
      setUser(u);
      setListings(ls);
      setReviews(rs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load shop");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Shop</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading && !user ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={tab === "listings" ? listings : []}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} tintColor="#F97316" />
          }
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <View style={styles.identity}>
                {user?.avatar ? (
                  <Image source={{ uri: user.avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Feather name="user" size={28} color="#94A3B8" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{user?.name ?? "Seller"}</Text>
                  <Text style={styles.meta}>
                    {[user?.location || user?.country, user?.totalSales != null ? `${user.totalSales} sales` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  {user?.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
                </View>
              </View>
              <View style={styles.tabs}>
                <Pressable
                  style={[styles.tab, tab === "listings" && styles.tabOn]}
                  onPress={() => setTab("listings")}
                >
                  <Text style={[styles.tabText, tab === "listings" && styles.tabTextOn]}>
                    Listings ({listings.length})
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.tab, tab === "reviews" && styles.tabOn]}
                  onPress={() => setTab("reviews")}
                >
                  <Text style={[styles.tabText, tab === "reviews" && styles.tabTextOn]}>
                    Reviews ({reviews.length})
                  </Text>
                </Pressable>
              </View>
              {tab === "reviews" ? (
                <View style={styles.reviews}>
                  {reviews.length === 0 ? (
                    <Text style={styles.empty}>No reviews yet.</Text>
                  ) : (
                    reviews.map((r) => (
                      <View key={r.id} style={styles.reviewCard}>
                        <Text style={styles.reviewTitle}>
                          {r.reviewerName} · {"★".repeat(Math.max(1, Math.min(5, r.rating)))}
                        </Text>
                        {r.comment ? (
                          <Text style={styles.reviewBody}>{r.comment}</Text>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            tab === "listings" ? (
              <Text style={styles.empty}>No public listings.</Text>
            ) : null
          }
          renderItem={({ item }) =>
            tab === "listings" ? <ListingCard item={item} /> : null
          }
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
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  error: { marginTop: 40, textAlign: "center", color: "#B91C1C" },
  list: { paddingHorizontal: 12, paddingBottom: 32 },
  row: { justifyContent: "space-between" },
  headerBlock: { gap: 12, marginBottom: 8 },
  identity: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#E2E8F0" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  name: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  meta: { color: "#64748B", fontSize: 13, marginTop: 2 },
  bio: { color: "#475569", fontSize: 13, marginTop: 6, lineHeight: 18 },
  tabs: { flexDirection: "row", gap: 8 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  tabOn: { backgroundColor: "#FFF7ED" },
  tabText: { color: "#475569", fontWeight: "700", fontSize: 13 },
  tabTextOn: { color: "#EA580C" },
  reviews: { gap: 8 },
  reviewCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  reviewTitle: { fontWeight: "700", color: "#0F172A", fontSize: 13 },
  reviewBody: { color: "#475569", marginTop: 4, fontSize: 13, lineHeight: 18 },
  empty: { textAlign: "center", color: "#64748B", marginVertical: 24 },
});
