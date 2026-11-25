/**
 * Public seller/buyer profile — used by follow notification deep links.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { getApiBase, type Listing } from "@/lib/api";
import { fetchUserListings } from "@/lib/sellerApi";

type PublicUser = {
  id: number;
  name: string;
  avatar?: string | null;
  bio?: string | null;
  city?: string | null;
  location?: string | null;
  country?: string | null;
  isVerified?: boolean;
  followerCount?: number;
  followingCount?: number;
  totalSales?: number;
  isFollowing?: boolean;
};

export default function PublicProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const userId = Number(idParam);
  const { token, isLoading: authLoading } = useAuth();
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!Number.isFinite(userId) || userId <= 0) {
      setError("Profile not found");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${getApiBase()}/users/${userId}`, { headers });
      if (res.status === 404) {
        setError("This profile is no longer available.");
        setProfile(null);
        return;
      }
      if (!res.ok) throw new Error(`Profile failed (${res.status})`);
      const data = (await res.json()) as PublicUser;
      setProfile(data);
      setError(null);
      if (token) {
        const rows = await fetchUserListings(userId, { token }).catch(() => []);
        setListings(rows);
      } else {
        setListings([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load profile");
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.topTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : error || !profile ? (
        <View style={styles.empty}>
          <Feather name="user-x" size={40} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>{error || "Profile not found"}</Text>
          <Pressable style={styles.retry} onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }}
          ListHeaderComponent={
            <View style={styles.headerCard}>
              {profile.avatar ? (
                <Image source={{ uri: profile.avatar }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>
                    {(profile.name || "U").charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.name}>
                {profile.name}
                {profile.isVerified ? " ✓" : ""}
              </Text>
              {(profile.city || profile.location || profile.country) ? (
                <Text style={styles.meta}>
                  {[profile.city || profile.location, profile.country].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
              {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
              <Text style={styles.stats}>
                {profile.followerCount ?? 0} followers · {profile.totalSales ?? 0} sales
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.listingCard}
              onPress={() => router.push(`/listing/${item.id}` as any)}
            >
              {item.images?.[0] ? (
                <Image source={{ uri: item.images[0] }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Feather name="image" size={18} color="#94A3B8" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.listingTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.listingPrice}>
                  ${Number(item.price).toFixed(2)}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyListings}>No public listings yet.</Text>
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: "#0F172A" },
  empty: { alignItems: "center", padding: 40, gap: 10 },
  emptyTitle: { color: "#64748B", textAlign: "center" },
  retry: {
    marginTop: 8,
    backgroundColor: "#F97316",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: "#fff", fontWeight: "700" },
  headerCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarFallback: { backgroundColor: "#F97316", alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: "#fff", fontSize: 28, fontWeight: "800" },
  name: { fontSize: 20, fontWeight: "800", color: "#0F172A", marginTop: 4 },
  meta: { fontSize: 13, color: "#64748B" },
  bio: { fontSize: 14, color: "#334155", textAlign: "center", marginTop: 4 },
  stats: { fontSize: 12, color: "#94A3B8", marginTop: 4 },
  listingCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
  },
  thumb: { width: 56, height: 56, borderRadius: 8 },
  thumbEmpty: { backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  listingTitle: { fontSize: 14, fontWeight: "600", color: "#0F172A" },
  listingPrice: { fontSize: 13, fontWeight: "700", color: "#F97316", marginTop: 4 },
  emptyListings: { textAlign: "center", color: "#94A3B8", marginTop: 20 },
});
