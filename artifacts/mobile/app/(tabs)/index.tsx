/**
 * Home — Phase 1 native marketplace feed (existing /api/listings).
 * Default UI language: English.
 */
import { useGetListings } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useCallback } from "react";
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

import { ListingCard } from "@/components/ListingCard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { NATIVE_APP_PHASE } from "@/lib/config";

export default function HomeTab() {
  const colors = useColors();
  const router = useRouter();
  const { user, token } = useAuth();
  const { data, isLoading, isFetching, isError, error, refetch } = useGetListings(
    { page: 1, limit: 40 },
  );

  const listings = data?.listings ?? [];

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.brand, { color: colors.foreground }]}>
            Flexa Market
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
            Phase {NATIVE_APP_PHASE} ·{" "}
            {token
              ? `Welcome${user?.name ? `, ${user.name}` : ""}`
              : "Guest"}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/cart")}
          style={[styles.iconBtn, { borderColor: colors.border }]}
        >
          <Text style={{ color: colors.foreground, fontWeight: "600" }}>
            Cart
          </Text>
        </Pressable>
      </View>

      {isLoading && listings.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>
            Loading listings…
          </Text>
        </View>
      ) : isError && listings.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ color: colors.foreground, fontWeight: "600" }}>
            Could not load listings
          </Text>
          <Text style={{ color: colors.mutedForeground, marginTop: 6 }}>
            {error instanceof Error ? error.message : "Network error"}
          </Text>
          <Pressable
            onPress={() => void refetch()}
            style={[styles.retry, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>
              No listings yet.
            </Text>
          }
          ListFooterComponent={
            <View style={styles.footer}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                {listings.length} / {data?.total ?? listings.length} listings
              </Text>
            </View>
          }
          renderItem={({ item }) => <ListingCard item={item} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brand: { fontSize: 24, fontWeight: "700", letterSpacing: -0.3 },
  iconBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  row: { justifyContent: "space-between" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  retry: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    minWidth: 140,
  },
  retryText: { color: "#0F172A", fontWeight: "700" },
  footer: { alignItems: "center", paddingVertical: 16 },
});
