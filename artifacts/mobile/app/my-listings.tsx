/**
 * Native My Listings — GET /api/users/:id/listings + edit/delete.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { formatMoney } from "@/lib/orderUi";
import {
  deleteListing,
  fetchSellerListings,
  type SellerListing,
} from "@/lib/sellerListingsApi";

export default function MyListingsScreen() {
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<SellerListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token || !user) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const data = await fetchSellerListings(user.id, { token });
        setRows(data);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load listings");
        setRows((prev) => prev ?? []);
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

  const onDelete = (item: SellerListing) => {
    Alert.alert("Delete listing?", item.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          try {
            await deleteListing(item.id, { token });
            setRows((prev) => (prev ?? []).filter((x) => x.id !== item.id));
          } catch (e) {
            Alert.alert("Delete failed", e instanceof Error ? e.message : "Try again");
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: SellerListing }) => {
    const img = item.images?.[0];
    const mod = item.moderationStatus || "approved";
    return (
      <View style={styles.card}>
        <Pressable
          style={styles.cardMain}
          onPress={() => router.push(`/listing/${item.id}`)}
        >
          {img ? (
            <Image source={{ uri: img }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]}>
              <Feather name="image" size={20} color="#94A3B8" />
            </View>
          )}
          <View style={styles.meta}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.price}>
              {formatMoney(Number(item.price), item.currency)}
            </Text>
            <Text style={styles.sub}>
              {item.status || "available"} · {mod}
            </Text>
          </View>
        </Pressable>
        <View style={styles.actions}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => router.push(`/sell-edit/${item.id}`)}
          >
            <Feather name="edit-2" size={16} color={colors.flexaGreen} />
            <Text style={styles.actionText}>Edit</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => router.push({ pathname: "/boost", params: { listingId: String(item.id) } })}
          >
            <Feather name="zap" size={16} color={colors.flexaOrange} />
            <Text style={[styles.actionText, { color: colors.flexaOrange }]}>Boost</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => onDelete(item)}>
            <Feather name="trash-2" size={16} color="#B91C1C" />
            <Text style={[styles.actionText, { color: "#B91C1C" }]}>Delete</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <AppHeader
        title="My listings"
        showBrand={false}
        showBack
        showCart={false}
        rightExtra={
          <Pressable onPress={() => router.push("/sell")} style={styles.headerAdd}>
            <Feather name="plus" size={20} color="#fff" />
          </Pressable>
        }
      />
      {rows === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={rows ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.flexaGreen}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error || "No listings yet. Tap + to sell something."}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  headerAdd: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    overflow: "hidden",
    marginBottom: 12,
  },
  cardMain: { flexDirection: "row", padding: 12, gap: 12 },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: "#E2E8F0" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  meta: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  price: { marginTop: 4, fontSize: 15, fontWeight: "800", color: colors.flexaGreen },
  sub: { marginTop: 4, fontSize: 12, color: "#64748B", textTransform: "capitalize" },
  actions: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  actionText: { fontSize: 13, fontWeight: "700", color: colors.flexaGreen },
  empty: { textAlign: "center", color: "#64748B", marginTop: 48, paddingHorizontal: 24 },
});
