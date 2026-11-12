import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { ListingCard } from "@/components/ListingCard";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { fetchListings, type Listing } from "@/lib/api";
import { getApiBase } from "@/lib/api";

export default function ShopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<any>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, list] = await Promise.all([
          fetch(`${getApiBase()}/users/${id}`),
          fetchListings({ country: "Haiti", page: 1, limit: 40 }).catch(() => ({ listings: [] as Listing[] })),
        ]);
        const p = await pRes.json().catch(() => ({}));
        if (!cancelled) {
          setProfile(p);
          const rows = (list.listings || []).filter((l: any) => String(l.sellerId) === String(id));
          setListings(rows.length ? rows : list.listings || []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <View style={styles.root}>
      <AppHeader title={profile?.name || "Shop"} showBrand={false} showBack />
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.flexaGreen} /> : null}
      {error ? <Text style={styles.msg}>{error}</Text> : null}
      <FlatList
        data={listings}
        keyExtractor={(i) => String(i.id)}
        numColumns={2}
        columnWrapperStyle={{ gap: 8, paddingHorizontal: 8 }}
        contentContainerStyle={{ paddingBottom: 40, gap: 8 }}
        ListHeaderComponent={
          <View style={styles.headerCard}>
            {profile?.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} /> : null}
            <Text style={styles.name}>{profile?.name || `Seller #${id}`}</Text>
            <Text style={styles.meta}>{profile?.city || profile?.country || ""}</Text>
            <Text style={styles.bio}>{profile?.bio || ""}</Text>
          </View>
        }
        renderItem={({ item }) => <ListingCard item={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  headerCard: { padding: 16, gap: 6 },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  name: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  meta: { color: colors.flexaGreen, fontWeight: "700" },
  bio: { color: "#64748B" },
  msg: { textAlign: "center", color: "#B91C1C", marginTop: 20 },
});
