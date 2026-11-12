/**
 * Native My Boosts — GET /api/boost/my-active
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
import {
  cancelBoost,
  fetchMyActiveBoosts,
  type ActiveBoost,
} from "@/lib/boostApi";
import { formatMoney } from "@/lib/orderUi";

export default function MyBoostsScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<ActiveBoost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const data = await fetchMyActiveBoosts({ token });
        setRows(data);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load boosts");
        setRows((p) => p ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load("initial");
    }, [authLoading, token, router, load]),
  );

  const onCancel = (item: ActiveBoost) => {
    Alert.alert("Cancel boost?", item.title, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel boost",
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          try {
            await cancelBoost(item.boostId, { token });
            void load("refresh");
          } catch (e) {
            Alert.alert("Could not cancel", e instanceof Error ? e.message : "Try again");
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: ActiveBoost }) => (
    <View style={styles.card}>
      <Pressable
        style={styles.main}
        onPress={() => router.push(`/listing/${item.listingId}`)}
      >
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Feather name="zap" size={18} color="#94A3B8" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.sub}>
            {item.plan || "boost"} · {item.isExpired ? "Expired" : "Active"}
          </Text>
          <Text style={styles.stats}>
            {item.impressions} impressions · {item.clicks} clicks · budget{" "}
            {formatMoney(item.budget)}
          </Text>
          {item.remainingBudgetUsd != null ? (
            <Text style={styles.stats}>
              Remaining {formatMoney(item.remainingBudgetUsd)}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.actions}>
        <Pressable
          style={styles.actionBtn}
          onPress={() => router.push("/boost-analytics")}
        >
          <Text style={styles.actionText}>Analytics</Text>
        </Pressable>
        {!item.isExpired ? (
          <Pressable style={styles.actionBtn} onPress={() => onCancel(item)}>
            <Text style={[styles.actionText, { color: "#B91C1C" }]}>Cancel</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.actionBtn}
            onPress={() =>
              router.push({ pathname: "/boost", params: { listingId: String(item.listingId) } })
            }
          >
            <Text style={styles.actionText}>Reboost</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <AppHeader title="My boosts" showBrand={false} showBack showCart={false} />
      {rows === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={rows ?? []}
          keyExtractor={(item) => String(item.boostId)}
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
            <Text style={styles.empty}>{error || "No active boosts yet."}</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    marginBottom: 12,
    overflow: "hidden",
  },
  main: { flexDirection: "row", gap: 12, padding: 12 },
  thumb: { width: 68, height: 68, borderRadius: 10, backgroundColor: "#E2E8F0" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  sub: { marginTop: 2, fontSize: 12, color: "#64748B", textTransform: "capitalize" },
  stats: { marginTop: 4, fontSize: 12, color: "#334155" },
  actions: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
  },
  actionBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  actionText: { fontWeight: "700", color: colors.flexaGreen },
  empty: { textAlign: "center", color: "#64748B", marginTop: 48 },
});
