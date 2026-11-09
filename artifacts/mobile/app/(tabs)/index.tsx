/**
 * Native Marketplace Home — listings feed + category chips.
 * Corrective path for Google Play Webviews / Affiliate Spam suspension.
 */
import { CategoryChips } from "@/components/CategoryChips";
import { ListingCard } from "@/components/ListingCard";
import { SkeletonCard } from "@/components/SkeletonCard";
import { StateView } from "@/components/StateView";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useListingsFeed } from "@/hooks/useListingsFeed";
import { countryFlag } from "@/lib/countries";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeTab() {
  const { token, user } = useAuth();
  const { t } = useLanguage();
  const { country, categories, isOffline } = useMarketplace();
  const [categorySlug, setCategorySlug] = useState<string | null>(null);

  const filter = useMemo(
    () => ({
      category: categorySlug || undefined,
      limit: 20,
    }),
    [categorySlug],
  );

  const feed = useListingsFeed(filter);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.brand}>Flexa Market</Text>
          <Text style={styles.sub}>
            {user ? `${t("greeting")}, ${user.name?.split(" ")[0] || "there"}` : t("tabHome")}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select country"
            style={styles.headerBtn}
            onPress={() => router.push("/country-picker")}
          >
            <Text style={styles.flag}>{countryFlag(country)}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.headerBtn}
            onPress={() => router.push(token ? "/(tabs)/profile" : "/auth/login")}
          >
            <Feather name={token ? "user" : "log-in"} size={18} color="#F8FAFC" />
          </Pressable>
        </View>
      </View>

      <CategoryChips
        categories={categories}
        selectedSlug={categorySlug}
        onSelect={setCategorySlug}
        onSeeAll={() => router.push("/categories")}
      />

      {feed.loading && feed.listings.length === 0 ? (
        <View style={styles.skeletonGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : (
        <StateView
          error={feed.listings.length === 0 ? feed.error : null}
          offline={feed.listings.length === 0 && (feed.offline || isOffline)}
          empty={!feed.loading && !feed.error && feed.listings.length === 0}
          emptyTitle={t("noListings")}
          emptyDetail={`No results in ${country}${categorySlug ? ` · ${categorySlug}` : ""}.`}
          onRetry={feed.reload}
        >
          <FlatList
            data={feed.listings}
            keyExtractor={(item) => String(item.id)}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={feed.refreshing}
                onRefresh={feed.refresh}
                tintColor="#F97316"
                colors={["#F97316"]}
              />
            }
            onEndReached={() => feed.loadMore()}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              feed.loadingMore ? (
                <ActivityIndicator color="#F97316" style={{ marginVertical: 16 }} />
              ) : (
                <Text style={styles.footerMeta}>
                  {feed.total > 0 ? `${feed.listings.length} / ${feed.total}` : ""}
                </Text>
              )
            }
            renderItem={({ item }) => <ListingCard item={item} />}
          />
        </StateView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerText: { flex: 1, paddingRight: 8 },
  brand: { fontSize: 26, fontWeight: "800", color: "#F8FAFC", letterSpacing: -0.4 },
  sub: { marginTop: 2, fontSize: 13, color: "#94A3B8" },
  headerActions: { flexDirection: "row", gap: 8 },
  headerBtn: {
    minWidth: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  flag: { fontSize: 18 },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  row: { justifyContent: "space-between" },
  skeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  footerMeta: {
    textAlign: "center",
    color: "#64748B",
    fontSize: 12,
    marginVertical: 12,
  },
});
