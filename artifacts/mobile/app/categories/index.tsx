import { StateView } from "@/components/StateView";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function CategoriesScreen() {
  const { categories, categoriesLoading, categoriesError, refreshCategories, isOffline } =
    useMarketplace();
  useAndroidBack();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          accessibilityRole="button"
        >
          <Feather name="arrow-left" size={20} color="#F8FAFC" />
        </Pressable>
        <Text style={styles.brand}>Flexa Market</Text>
        <View style={styles.iconBtn} />
      </View>
      <Text style={styles.title}>Categories</Text>

      <StateView
        loading={categoriesLoading && categories.length === 0}
        error={categories.length === 0 ? categoriesError : null}
        offline={categories.length === 0 && isOffline}
        empty={!categoriesLoading && !categoriesError && categories.length === 0}
        emptyTitle="No categories"
        onRetry={refreshCategories}
      >
        <FlatList
          data={categories}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/categories/${item.slug}`)}
            >
              <Text style={styles.icon}>{item.icon || "📦"}</Text>
              <View style={styles.rowText}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {(item.children?.length ?? 0) > 0
                    ? `${item.children!.length} subcategories`
                    : item.slug}
                  {typeof item.listingCount === "number" ? ` · ${item.listingCount} listings` : ""}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color="#64748B" />
            </Pressable>
          )}
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
    marginBottom: 12,
    fontSize: 22,
    fontWeight: "800",
    color: "#F97316",
  },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  icon: { fontSize: 22 },
  rowText: { flex: 1 },
  name: { color: "#F8FAFC", fontSize: 15, fontWeight: "700" },
  meta: { color: "#94A3B8", fontSize: 12, marginTop: 2 },
});
