import {
  getGetUserListingsQueryKey,
  useGetUserListings,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
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

export default function MyListingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token, user } = useAuth();
  const userId = Number(user?.id ?? 0);
  const enabled = Boolean(token) && userId > 0;
  const { data, isLoading, isError, refetch } = useGetUserListings(userId, {
    query: {
      queryKey: getGetUserListingsQueryKey(userId),
      enabled,
    },
  });
  const listings = data ?? [];

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.mutedForeground }}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>My listings</Text>
      </View>

      {!token ? (
        <View style={styles.pad}>
          <SignInGate message="Sign in to manage your listings." />
        </View>
      ) : isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : isError ? (
        <View style={styles.pad}>
          <Text style={{ color: colors.foreground }}>Could not load listings.</Text>
          <Pressable onPress={() => void refetch()} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>
              You have no listings yet.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/listing/${item.id}`)}
              style={[styles.row, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
                {item.status || "listing"} · {item.price != null ? `$${item.price}` : ""}
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
