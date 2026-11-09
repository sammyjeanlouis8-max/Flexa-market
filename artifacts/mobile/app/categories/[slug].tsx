import { ListingCard } from "@/components/ListingCard";
import { StateView } from "@/components/StateView";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { useListingsFeed } from "@/hooks/useListingsFeed";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function CategoryDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { categories, country } = useMarketplace();
  const [subcategory, setSubcategory] = useState<string | null>(null);
  useAndroidBack();

  const parent = categories.find((c) => c.slug === slug);
  const filter = useMemo(
    () => ({
      category: slug,
      subcategory: subcategory || undefined,
      limit: 20,
    }),
    [slug, subcategory],
  );
  const feed = useListingsFeed(filter);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/categories"))}
        >
          <Feather name="arrow-left" size={20} color="#F8FAFC" />
        </Pressable>
        <Text style={styles.brand}>Flexa Market</Text>
        <Pressable style={styles.iconBtn} onPress={() => router.push({ pathname: "/(tabs)/search", params: { category: slug } })}>
          <Feather name="search" size={18} color="#F8FAFC" />
        </Pressable>
      </View>

      <Text style={styles.title}>
        {parent?.icon ? `${parent.icon} ` : ""}
        {parent?.name || slug}
      </Text>
      <Text style={styles.sub}>{country}</Text>

      {(parent?.children?.length ?? 0) > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subs}>
          <Pressable
            style={[styles.subChip, !subcategory && styles.subChipActive]}
            onPress={() => setSubcategory(null)}
          >
            <Text style={[styles.subText, !subcategory && styles.subTextActive]}>All</Text>
          </Pressable>
          {parent!.children!.map((child) => {
            const active = subcategory === child.slug;
            return (
              <Pressable
                key={child.id}
                style={[styles.subChip, active && styles.subChipActive]}
                onPress={() => setSubcategory(child.slug)}
              >
                <Text style={[styles.subText, active && styles.subTextActive]}>{child.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <StateView
        loading={feed.loading && feed.listings.length === 0}
        error={feed.listings.length === 0 ? feed.error : null}
        offline={feed.listings.length === 0 && feed.offline}
        empty={!feed.loading && !feed.error && feed.listings.length === 0}
        emptyTitle="No listings in this category"
        emptyDetail="Try another subcategory or country."
        onRetry={feed.reload}
      >
        <FlatList
          data={feed.listings}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          onEndReached={() => feed.loadMore()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            feed.loadingMore ? <ActivityIndicator color="#F97316" style={{ marginVertical: 16 }} /> : null
          }
          renderItem={({ item }) => <ListingCard item={item} />}
        />
      </StateView>
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
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 16, fontWeight: "800", color: "#F8FAFC" },
  title: {
    marginHorizontal: 16,
    marginTop: 4,
    fontSize: 22,
    fontWeight: "800",
    color: "#F97316",
  },
  sub: { marginHorizontal: 16, marginBottom: 10, color: "#94A3B8", fontSize: 13 },
  subs: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  subChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0F172A",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  subChipActive: { backgroundColor: "#F97316", borderColor: "#F97316" },
  subText: { color: "#CBD5E1", fontSize: 13, fontWeight: "600" },
  subTextActive: { color: "#fff" },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  row: { justifyContent: "space-between" },
});
