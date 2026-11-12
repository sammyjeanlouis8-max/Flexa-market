/**
 * Native referral dashboard — code, share, history, points, verified earnings.
 */
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  fetchReferralLeaderboard,
  fetchReferralStats,
  fetchWalletReferral,
  type LeaderboardEntry,
  type ReferralHistoryItem,
  type ReferralStats,
  type WalletReferral,
} from "@/lib/referralsApi";

export default function ReferralsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [walletRef, setWalletRef] = useState<WalletReferral | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const [s, w, lb] = await Promise.all([
          fetchReferralStats({ token }),
          fetchWalletReferral({ token }).catch(() => null),
          fetchReferralLeaderboard().catch(() => []),
        ]);
        setStats(s);
        setWalletRef(w);
        setBoard(lb);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load referrals");
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

  const onCopy = async () => {
    if (!stats?.referralCode) return;
    await Clipboard.setStringAsync(stats.referralCode);
    Alert.alert("Copied", "Referral code copied to clipboard.");
  };

  const onShare = async () => {
    if (!stats?.referralLink && !stats?.referralCode) return;
    await Share.share({
      message: `Join Flexa Market with my code ${stats.referralCode}: ${stats.referralLink}`,
      url: stats.referralLink || undefined,
    });
  };

  const history: ReferralHistoryItem[] = stats?.history ?? [];

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Referrals</Text>
        <View style={{ width: 40 }} />
      </View>

      {!stats && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor="#F97316" />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 28 }}
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 12 }}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.card}>
                <Text style={styles.label}>Your referral code</Text>
                <Text style={styles.code}>{stats?.referralCode || "—"}</Text>
                <View style={styles.row}>
                  <Pressable style={styles.btn} onPress={onCopy} testID="btn-copy-referral">
                    <Text style={styles.btnText}>Copy</Text>
                  </Pressable>
                  <Pressable style={styles.btnGhost} onPress={onShare} testID="btn-share-referral">
                    <Text style={styles.btnGhostText}>Share link</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.grid}>
                {[
                  ["Points", stats?.referralPoints ?? 0],
                  ["Referrals", stats?.referralCount ?? 0],
                  ["Rank", stats?.leaderboardRank ?? "—"],
                  ["Bonuses paid", walletRef?.bonusesPaid != null ? `$${Number(walletRef.bonusesPaid).toFixed(2)}` : "—"],
                ].map(([k, v]) => (
                  <View key={String(k)} style={styles.stat}>
                    <Text style={styles.statLabel}>{k}</Text>
                    <Text style={styles.statValue}>{String(v)}</Text>
                  </View>
                ))}
              </View>
              {walletRef?.bonusPerReferral != null ? (
                <Text style={styles.note}>
                  Verified promo bonus per eligible referral: ${Number(walletRef.bonusPerReferral).toFixed(2)}.
                  Amounts come from the server — nothing is invented in the app.
                </Text>
              ) : null}
              <Text style={styles.section}>Leaderboard</Text>
              {board.slice(0, 10).map((e) => (
                <View key={e.id} style={styles.lbRow}>
                  <Text style={styles.lbRank}>#{e.rank}</Text>
                  <Text style={styles.lbName} numberOfLines={1}>{e.name}</Text>
                  <Text style={styles.lbPts}>{e.referralPoints} pts</Text>
                </View>
              ))}
              <Text style={styles.section}>Referral history</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>No referral history yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.referredName || `Referral #${item.id}`}</Text>
              <Text style={styles.meta}>
                {[item.status, item.pointsAwarded != null ? `${item.pointsAwarded} pts` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  back: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  error: { color: "#B91C1C", fontWeight: "600" },
  card: {
    backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#E2E8F0", gap: 6, marginBottom: 8,
  },
  label: { color: "#64748B", fontSize: 12, fontWeight: "600" },
  code: { fontSize: 22, fontWeight: "800", color: "#0F172A", letterSpacing: 1 },
  row: { flexDirection: "row", gap: 8, marginTop: 4 },
  btn: { backgroundColor: "#F97316", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  btnGhost: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  btnGhostText: { color: "#0F172A", fontWeight: "700", fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { width: "48%", backgroundColor: "#fff", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E2E8F0" },
  statLabel: { color: "#64748B", fontSize: 11, fontWeight: "600" },
  statValue: { fontSize: 18, fontWeight: "800", color: "#0F172A", marginTop: 4 },
  note: { color: "#64748B", fontSize: 12, lineHeight: 17 },
  section: { fontWeight: "800", color: "#0F172A", marginTop: 4 },
  lbRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  lbRank: { width: 36, fontWeight: "800", color: "#EA580C" },
  lbName: { flex: 1, color: "#0F172A", fontWeight: "600" },
  lbPts: { color: "#64748B", fontSize: 12 },
  empty: { color: "#94A3B8", marginVertical: 8 },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  meta: { color: "#64748B", fontSize: 12 },
});
