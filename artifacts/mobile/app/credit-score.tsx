/**
 * Credit score — GET /api/credit-score/my
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/request";

type Score = {
  score?: number;
  grade?: string;
  band?: string;
  factors?: {
    label?: string;
    name?: string;
    impact?: string;
    value?: string | number;
    points?: number;
  }[];
  updatedAt?: string;
  explanation?: string;
};

export default function CreditScoreScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<Score | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        setData(await apiRequest<Score>("/credit-score/my", { token }));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load credit score");
        setData(null);
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
      if (token) void load();
    }, [authLoading, token, router, load]),
  );

  const score = Number(data?.score ?? 0);
  const grade = data?.grade || data?.band || "—";

  return (
    <View style={styles.root}>
      <AppHeader title="Credit Score" showBack />
      {!data && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.flexaGreen}
            />
          }
        >
          {error ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retry}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.heroCard}>
            <Text style={styles.label}>Flexa seller score</Text>
            <Text style={styles.score}>{score || "—"}</Text>
            <Text style={styles.grade}>Grade {grade}</Text>
            {data?.explanation ? <Text style={styles.explain}>{data.explanation}</Text> : null}
          </View>
          <Text style={styles.section}>Factors</Text>
          {(data?.factors ?? []).length === 0 && !error ? (
            <Text style={styles.empty}>No factor breakdown returned.</Text>
          ) : (
            (data?.factors ?? []).map((f, i) => (
              <View key={i} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{f.label || f.name || `Factor ${i + 1}`}</Text>
                  {f.value != null ? <Text style={styles.rowMeta}>{String(f.value)}</Text> : null}
                </View>
                <Text style={styles.points}>
                  {f.points != null ? `${f.points > 0 ? "+" : ""}${f.points}` : f.impact || ""}
                </Text>
              </View>
            ))
          )}
          <Pressable style={styles.link} onPress={() => router.push("/loans")}>
            <Text style={styles.linkText}>Check loan eligibility</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { backgroundColor: "#FEF2F2", padding: 10, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: "#B91C1C" },
  retry: { color: colors.flexaGreen, fontWeight: "700", marginTop: 4 },
  heroCard: {
    backgroundColor: colors.flexaGreen,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
  },
  label: { color: "rgba(255,255,255,0.8)", fontWeight: "700" },
  score: { fontSize: 56, fontWeight: "900", color: "#fff", marginTop: 4 },
  grade: { color: "#fff", fontWeight: "800", fontSize: 16 },
  explain: { marginTop: 10, color: "rgba(255,255,255,0.9)", lineHeight: 20 },
  section: { fontWeight: "800", fontSize: 16, marginBottom: 8, color: colors.light.text },
  empty: { color: "#94A3B8" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { fontWeight: "700", color: colors.light.text },
  rowMeta: { color: "#64748B", fontSize: 12, marginTop: 2 },
  points: { fontWeight: "800", color: colors.flexaGreen },
  link: { marginTop: 12 },
  linkText: { color: colors.flexaGreen, fontWeight: "800" },
});
