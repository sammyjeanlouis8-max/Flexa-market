import {
  getGetFavoritesQueryKey,
  useGetFavorites,
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

import { ListingCard } from "@/components/ListingCard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function FavoritesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const enabled = Boolean(token);
  const { data, isLoading, isError, refetch } = useGetFavorites({
    query: {
      queryKey: getGetFavoritesQueryKey(),
      enabled,
    },
  });

  const favorites = data ?? [];

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.back, { borderColor: colors.border }]}
        >
          <Text style={{ color: colors.foreground, fontWeight: "600" }}>
            Retounen
          </Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Favori</Text>
      </View>

      {!token ? (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground, marginBottom: 12 }}>
            Konekte pou wè favori ou yo.
          </Text>
          <Pressable
            onPress={() => router.push("/auth/login")}
            style={[styles.cta, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.ctaText}>Konekte</Text>
          </Pressable>
        </View>
      ) : isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={{ color: colors.foreground }}>Pa ka chaje favori</Text>
          <Pressable onPress={() => void refetch()} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>
              Eseye ankò
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text
              style={{ color: colors.mutedForeground, textAlign: "center" }}
            >
              Ou poko gen favori.
            </Text>
          }
          renderItem={({ item }) => <ListingCard item={item} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 10 },
  back: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  title: { fontSize: 28, fontWeight: "700" },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  row: { justifyContent: "space-between" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  cta: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 },
  ctaText: { color: "#0F172A", fontWeight: "700" },
});
