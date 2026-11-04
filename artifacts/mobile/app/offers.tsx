import {
  getGetMyOffersQueryKey,
  useGetMyOffers,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SignInGate } from "@/components/SignInGate";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function OffersScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const enabled = Boolean(token);
  const { data, isLoading, isError, refetch } = useGetMyOffers({
    query: {
      queryKey: getGetMyOffersQueryKey(),
      enabled,
    },
  });

  const offers = useMemo(() => {
    if (!data) return [];
    return [...(data.received ?? []), ...(data.sent ?? [])];
  }, [data]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.mutedForeground }}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Offers</Text>
      </View>

      {!token ? (
        <View style={styles.pad}>
          <SignInGate message="Sign in to view your offers." />
        </View>
      ) : isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : isError ? (
        <View style={styles.pad}>
          <Text style={{ color: colors.foreground }}>Could not load offers.</Text>
          <Pressable onPress={() => void refetch()} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>
              No offers yet.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/listing/${item.listingId}`)}
              style={[styles.row, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                {item.listingTitle || `Offer #${item.id}`}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
                {item.status} · ${Number(item.amount).toFixed(2)}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, gap: 6 },
  title: { fontSize: 28, fontWeight: "700" },
  pad: { padding: 20 },
  list: { padding: 20, paddingBottom: 40 },
  row: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
});
