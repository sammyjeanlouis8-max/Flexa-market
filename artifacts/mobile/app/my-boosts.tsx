/**
 * Native boost / campaign library with draft · active · paused · expired filters.
 * Pause/resume only for paid campaigns. Paid launch / renewal checkout stays blocked.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  fetchBoosterCampaigns,
  fetchMyBoosts,
  pauseBoosterCampaign,
  resumeBoosterCampaign,
  type BoostCampaign,
} from "@/lib/sellerApi";

type Filter = "all" | "draft" | "active" | "paused" | "expired";

function statusOf(c: BoostCampaign): string {
  return String(c.status || "").toLowerCase();
}

export default function MyBoostsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState<BoostCampaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const [boosts, campaigns] = await Promise.all([
          fetchMyBoosts({ token }),
          fetchBoosterCampaigns({ token }).catch(() => [] as BoostCampaign[]),
        ]);
        const merged = [...campaigns, ...boosts];
        const seen = new Set<string>();
        const unique = merged.filter((b) => {
          const key = String(b.id);
          if (!Number.isFinite(b.id) || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setRows(unique);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load campaigns");
        setRows((prev) => prev ?? []);
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

  const filtered = useMemo(() => {
    const list = rows ?? [];
    if (filter === "all") return list;
    return list.filter((c) => statusOf(c) === filter);
  }, [rows, filter]);

  const onPauseResume = async (item: BoostCampaign) => {
    if (!token) return;
    const st = statusOf(item);
    setBusyId(item.id);
    try {
      if (st === "paused") await resumeBoosterCampaign(item.id, { token });
      else await pauseBoosterCampaign(item.id, { token });
      await load("refresh");
    } catch (e) {
      Alert.alert("Action failed", e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  };

  const filters: Filter[] = ["all", "draft", "active", "paused", "expired"];

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/sell"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>{t("campaignsTitle") || "Campaigns"}</Text>
        <Pressable style={styles.back} onPress={() => router.push("/boost-create")}>
          <Feather name="plus" size={18} color="#0F172A" />
        </Pressable>
      </View>

      <Text style={styles.banner}>
        {t("boostPaidBlocked") ||
          "Paid boost checkout is unavailable on Android (Play digital goods policy). Drafts are free; pause/resume applies only to already-paid campaigns."}
      </Text>

      <View style={styles.filters}>
        {filters.map((f) => (
          <Pressable
            key={f}
            style={[styles.chip, filter === f && styles.chipOn]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextOn]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      {rows === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor="#F97316"
            />
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            <Text style={styles.empty}>{t("noCampaigns") || "No campaigns in this filter."}</Text>
          }
          renderItem={({ item }) => {
            const st = statusOf(item);
            const paidActions = st === "active" || st === "paused";
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {item.title || item.plan || `Campaign #${item.id}`}
                </Text>
                <Text style={styles.meta}>
                  {[st || "unknown", item.listingId ? `Listing ${item.listingId}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                <Text style={styles.meta}>
                  Impressions {item.impressions ?? 0} · Clicks {item.clicks ?? 0}
                  {item.videoViews != null ? ` · Views ${item.videoViews}` : ""}
                </Text>
                <View style={styles.actions}>
                  {st === "draft" ? (
                    <Pressable
                      style={styles.btnGhost}
                      onPress={() =>
                        Alert.alert(
                          "Draft campaign",
                          "Edit targeting by creating a new draft. Paid launch remains blocked on Android.",
                          [
                            { text: "New draft", onPress: () => router.push("/boost-create") },
                            { text: "OK" },
                          ],
                        )
                      }
                    >
                      <Text style={styles.btnGhostText}>Draft options</Text>
                    </Pressable>
                  ) : null}
                  {st === "expired" ? (
                    <Pressable
                      style={styles.btnGhost}
                      onPress={() => router.push("/boost-create")}
                    >
                      <Text style={styles.btnGhostText}>Renew as draft</Text>
                    </Pressable>
                  ) : null}
                  {paidActions ? (
                    <Pressable
                      style={styles.btn}
                      disabled={busyId === item.id}
                      onPress={() => void onPauseResume(item)}
                    >
                      <Text style={styles.btnText}>
                        {busyId === item.id ? "…" : st === "paused" ? "Resume" : "Pause"}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={styles.btnGhost}
                    onPress={() =>
                      router.push({
                        pathname: "/boost-analytics",
                        params: { boostId: String(item.id) },
                      })
                    }
                  >
                    <Text style={styles.btnGhostText}>Analytics</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  banner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    padding: 12,
    color: "#9A3412",
    fontSize: 12,
    lineHeight: 17,
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#FFF7ED" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#475569", textTransform: "capitalize" },
  chipTextOn: { color: "#EA580C" },
  error: { color: "#B91C1C", marginBottom: 8, fontWeight: "600" },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
    gap: 4,
  },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  meta: { color: "#64748B", fontSize: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  btn: {
    backgroundColor: "#0F172A",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  btnGhost: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnGhostText: { color: "#0F172A", fontWeight: "700", fontSize: 12 },
});
