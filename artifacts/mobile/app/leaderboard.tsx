/**
 * Referral leaderboard — GET /api/referrals/leaderboard + /referrals/my-stats
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/request";

type Row = {
  rank: number;
  id: number;
  name: string;
  referralPoints: number;
  referralCount: number;
};

type MyStats = {
  referralCode?: string | null;
  referralLink?: string | null;
  referralPoints?: number;
  referralCount?: number;
  leaderboardRank?: number;
};

export default function LeaderboardScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mine, setMine] = useState<MyStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") setRefreshing(true);
      try {
        const board = await apiRequest<{ leaderboard: Row[] }>("/referrals/leaderboard");
        setRows(board.leaderboard ?? []);
        if (token) {
          try {
            setMine(await apiRequest<MyStats>("/referrals/my-stats", { token }));
          } catch {
            setMine(null);
          }
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load leaderboard");
        setRows((p) => p ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const share = async () => {
    const link = mine?.referralLink || (mine?.referralCode ? `https://flexamarket.com/auth/register?ref=${mine.referralCode}` : null);
    if (!link) {
      if (!token) router.push("/auth/login");
      return;
    }
    await Share.share({ message: `Join Flexa Market with my code ${mine?.referralCode}: ${link}` });
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Referral Program" showBack />
      {rows === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={rows ?? []}
          keyExtractor={(r) => String(r.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={colors.flexaGreen} />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListHeaderComponent={
            <View style={{ marginBottom: 12 }}>
              {error ? (
                <View style={styles.banner}>
                  <Text style={styles.bannerText}>{error}</Text>
                </View>
              ) : null}
              <Text style={styles.hero}>Top referrers</Text>
              <Text style={styles.sub}>Merchants who refer the most earn higher visibility.</Text>
              {mine ? (
                <View style={styles.mine}>
                  <Text style={styles.mineTitle}>Your rank #{mine.leaderboardRank ?? "—"}</Text>
                  <Text style={styles.mineMeta}>
                    {mine.referralPoints ?? 0} pts · {mine.referralCount ?? 0} referrals
                  </Text>
                  {mine.referralCode ? (
                    <Text style={styles.code}>Code: {mine.referralCode}</Text>
                  ) : null}
                  <Pressable style={styles.share} onPress={() => void share()}>
                    <Feather name="share-2" size={16} color="#fff" />
                    <Text style={styles.shareText}>Share invite</Text>
                  </Pressable>
                </View>
              ) : !authLoading && !token ? (
                <Pressable style={styles.share} onPress={() => router.push("/auth/login")}>
                  <Text style={styles.shareText}>Log in to see your rank</Text>
                </Pressable>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>No referral rankings yet</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rank}>
                <Text style={styles.rankText}>{item.rank}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {item.referralCount} referrals · {item.referralPoints} pts
                </Text>
              </View>
              {item.rank <= 3 ? <Feather name="award" size={18} color={colors.flexaOrange} /> : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  hero: { fontSize: 20, fontWeight: "800", color: colors.light.text },
  sub: { color: "#64748B", marginTop: 4, marginBottom: 12 },
  banner: { backgroundColor: "#FEF2F2", padding: 10, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: "#B91C1C" },
  mine: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 8,
  },
  mineTitle: { fontWeight: "800", color: colors.light.text, fontSize: 16 },
  mineMeta: { color: "#64748B", marginTop: 4 },
  code: { marginTop: 6, fontWeight: "700", color: colors.flexaGreen },
  share: {
    marginTop: 12,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.flexaGreen,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  shareText: { color: "#fff", fontWeight: "800" },
  empty: { color: "#94A3B8", fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
    marginBottom: 8,
  },
  rank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { fontWeight: "800", color: colors.flexaGreen },
  name: { fontWeight: "700", color: colors.light.text },
  meta: { fontSize: 12, color: "#64748B", marginTop: 2 },
});
