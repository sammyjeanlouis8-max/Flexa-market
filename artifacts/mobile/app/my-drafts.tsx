/**
 * Native My Drafts — pending/rejected listings + draft/expired boost campaigns.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { fetchBoostAnalytics } from "@/lib/boostApi";
import { formatMoney } from "@/lib/orderUi";
import {
  fetchSellerListings,
  isDraftListing,
  type SellerListing,
} from "@/lib/sellerListingsApi";

type Tab = "listings" | "boosts";

type BoostDraft = {
  boostId: number;
  listingId: number;
  title: string;
  thumbnail: string | null;
  status: string;
  budget: number;
};

export default function MyDraftsScreen() {
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("listings");
  const [listings, setListings] = useState<SellerListing[] | null>(null);
  const [boosts, setBoosts] = useState<BoostDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token || !user) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const [mine, analytics] = await Promise.all([
          fetchSellerListings(user.id, { token }),
          fetchBoostAnalytics({ token }, { status: "all" }).catch(() => ({ campaigns: [] })),
        ]);
        setListings(mine.filter(isDraftListing));
        setBoosts(
          (analytics.campaigns || [])
            .filter((c) => ["draft", "pending", "paused", "expired"].includes(c.status))
            .map((c) => ({
              boostId: c.boostId,
              listingId: c.listingId,
              title: c.title,
              thumbnail: c.thumbnail,
              status: c.status,
              budget: c.budget,
            })),
        );
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load drafts");
        setListings((p) => p ?? []);
        setBoosts((p) => p ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token, user],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && user) void load("initial");
    }, [authLoading, token, user, router, load]),
  );

  const data = useMemo(
    () => (tab === "listings" ? listings ?? [] : boosts ?? []),
    [tab, listings, boosts],
  );

  return (
    <View style={styles.root}>
      <AppHeader title="My drafts" showBrand={false} showBack showCart={false} />
      <View style={styles.tabs}>
        {(["listings", "boosts"] as Tab[]).map((t) => (
          <Pressable
            key={t}
            style={[styles.tab, tab === t && styles.tabOn]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
              {t === "listings" ? "Listings" : "Boosts"}
            </Text>
          </Pressable>
        ))}
      </View>

      {listings === null && boosts === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={data as any[]}
          keyExtractor={(item) =>
            tab === "listings" ? `l-${item.id}` : `b-${item.boostId}`
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.flexaGreen}
            />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error || (tab === "listings" ? "No listing drafts." : "No boost drafts.")}
            </Text>
          }
          renderItem={({ item }) => {
            if (tab === "listings") {
              const l = item as SellerListing;
              return (
                <Pressable
                  style={styles.card}
                  onPress={() => router.push(`/sell-edit/${l.id}`)}
                >
                  {l.images?.[0] ? (
                    <Image source={{ uri: l.images[0] }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Feather name="image" size={18} color="#94A3B8" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={2}>
                      {l.title}
                    </Text>
                    <Text style={styles.sub}>
                      {l.moderationStatus || l.lifecycleStatus || l.status || "draft"}
                    </Text>
                    <Text style={styles.price}>
                      {formatMoney(Number(l.price), l.currency)}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="#94A3B8" />
                </Pressable>
              );
            }
            const b = item as BoostDraft;
            return (
              <Pressable
                style={styles.card}
                onPress={() =>
                  router.push({ pathname: "/boost", params: { listingId: String(b.listingId) } })
                }
              >
                {b.thumbnail ? (
                  <Image source={{ uri: b.thumbnail }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Feather name="zap" size={18} color="#94A3B8" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={2}>
                    {b.title}
                  </Text>
                  <Text style={styles.sub}>{b.status}</Text>
                  <Text style={styles.price}>{formatMoney(b.budget)}</Text>
                </View>
                <Feather name="chevron-right" size={18} color="#94A3B8" />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  tabs: { flexDirection: "row", padding: 12, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
  },
  tabOn: { backgroundColor: colors.flexaGreen },
  tabText: { fontWeight: "700", color: "#475569" },
  tabTextOn: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, paddingBottom: 40 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
    marginBottom: 10,
  },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: "#E2E8F0" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  sub: { marginTop: 2, fontSize: 12, color: "#64748B", textTransform: "capitalize" },
  price: { marginTop: 4, fontSize: 14, fontWeight: "800", color: colors.flexaGreen },
  empty: { textAlign: "center", color: "#64748B", marginTop: 48 },
});
