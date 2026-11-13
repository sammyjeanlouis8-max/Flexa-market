/**
 * Native public seller shop — GET /api/users/:id + /listings
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import type { Listing } from "@/lib/api";
import { formatMoney } from "@/lib/orderUi";
import {
  fetchShopListings,
  fetchShopProfile,
  followShop,
  unfollowShop,
  type PublicShop,
} from "@/lib/shopApi";

export default function ShopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token, user } = useAuth();
  const [shop, setShop] = useState<PublicShop | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!id) return;
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const [profile, rows] = await Promise.all([
          fetchShopProfile(id, { token }),
          fetchShopListings(id, { token }),
        ]);
        setShop(profile);
        setListings(rows);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load shop");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id, token],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  const onFollow = async () => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    if (!shop) return;
    if (user?.id === shop.id) return;
    setFollowBusy(true);
    try {
      if (shop.isFollowing) await unfollowShop(shop.id, { token });
      else await followShop(shop.id, { token });
      await load("refresh");
    } catch (e) {
      Alert.alert("Follow failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setFollowBusy(false);
    }
  };

  const header = (
    <View style={styles.profile}>
      {shop?.avatar ? (
        <Image source={{ uri: shop.avatar }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, styles.avatarEmpty]}>
          <Feather name="user" size={28} color="#94A3B8" />
        </View>
      )}
      <Text style={styles.name}>{shop?.name || "Seller"}</Text>
      {shop?.bio ? <Text style={styles.bio}>{shop.bio}</Text> : null}
      <Text style={styles.meta}>
        {shop?.location || shop?.country || "—"}
        {shop?.isVerified ? " · Verified" : ""}
      </Text>
      <Text style={styles.meta}>
        ★ {Number(shop?.rating ?? 0).toFixed(1)} ({shop?.reviewCount ?? 0}) ·{" "}
        {shop?.listingCount ?? listings.length} listings · {shop?.totalSales ?? 0} sales
      </Text>
      {user?.id !== shop?.id ? (
        <Pressable
          style={[styles.follow, shop?.isFollowing && styles.following]}
          disabled={followBusy}
          onPress={() => void onFollow()}
        >
          <Text style={styles.followText}>{shop?.isFollowing ? "Following" : "Follow"}</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.section}>Listings</Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <AppHeader title="Shop" showBrand={false} showBack />
      {loading && !shop ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={header}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.flexaGreen}
            />
          }
          ListEmptyComponent={<Text style={styles.empty}>No public listings.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/listing/${item.id}`)}
            >
              {item.images?.[0] ? (
                <Image source={{ uri: item.images[0] }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Feather name="image" size={18} color="#94A3B8" />
                </View>
              )}
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.cardPrice}>
                {formatMoney(Number(item.price), item.currency)}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 12, paddingBottom: 40 },
  profile: { alignItems: "center", paddingHorizontal: 8, paddingBottom: 8 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: "#E2E8F0" },
  avatarEmpty: { alignItems: "center", justifyContent: "center" },
  name: { marginTop: 10, fontSize: 22, fontWeight: "800", color: "#0F172A" },
  bio: { marginTop: 6, textAlign: "center", color: "#475569", paddingHorizontal: 12 },
  meta: { marginTop: 6, fontSize: 12, color: "#64748B", textAlign: "center" },
  follow: {
    marginTop: 12,
    backgroundColor: colors.flexaGreen,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 12,
  },
  following: { backgroundColor: "#94A3B8" },
  followText: { color: "#fff", fontWeight: "800" },
  error: { marginTop: 8, color: "#B91C1C" },
  section: {
    alignSelf: "flex-start",
    marginTop: 18,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  row: { gap: 10 },
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    overflow: "hidden",
    marginBottom: 10,
  },
  thumb: { width: "100%", aspectRatio: 1, backgroundColor: "#E2E8F0" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  cardTitle: { paddingHorizontal: 8, paddingTop: 8, fontSize: 13, fontWeight: "700", color: "#0F172A" },
  cardPrice: {
    paddingHorizontal: 8,
    paddingBottom: 10,
    paddingTop: 4,
    fontSize: 13,
    fontWeight: "800",
    color: colors.flexaGreen,
  },
  empty: { textAlign: "center", color: "#64748B", marginTop: 16 },
});
