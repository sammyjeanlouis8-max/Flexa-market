/**
 * Native boost campaign analytics detail.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { friendlyApiError, tr } from "@/i18n/nativeScreens";
import {
  fetchBoostAnalytics,
  type BoostAnalyticsDetail,
} from "@/lib/boostApi";

function money(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function BoostAnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id: idParam } = useLocalSearchParams<{ id?: string }>();
  const boostId = Number(idParam);
  const { token, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();

  const [data, setData] = useState<BoostAnalyticsDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token || !Number.isFinite(boostId)) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const detail = await fetchBoostAnalytics(boostId, { token });
        setData(detail);
        setError(null);
      } catch (e) {
        setError(
          friendlyApiError(e instanceof Error ? e.message : undefined, t) ||
            t("boost_analytics_loadError"),
        );
      } finally {
        setRefreshing(false);
      }
    },
    [token, boostId, t],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && Number.isFinite(boostId)) void load("initial");
    }, [authLoading, token, router, load, boostId]),
  );

  const maxImpressions = useMemo(() => {
    const series = data?.series ?? [];
    return Math.max(1, ...series.map((p) => p.impressions));
  }, [data?.series]);

  const o = data?.overview;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]} testID="boost-analytics">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </Pressable>
        <Text style={styles.topTitle}>{t("boost_analytics_title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, gap: 14, paddingHorizontal: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor="#F97316" />
        }
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void load("initial")}>
              <Text style={styles.retry}>{t("common_retry")}</Text>
            </Pressable>
          </View>
        ) : null}

        {!data && !error ? <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} /> : null}

        {o ? (
          <>
            <LinearGradient colors={["#F97316", "#F59E0B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <View style={styles.heroRow}>
                {o.thumbnail ? (
                  <Image source={{ uri: o.thumbnail }} style={styles.heroThumb} contentFit="cover" />
                ) : (
                  <View style={[styles.heroThumb, styles.heroThumbFallback]}>
                    <Feather name="zap" size={22} color="#fff" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle} numberOfLines={2}>
                    {o.title || t("boosts_title")}
                  </Text>
                  <Text style={styles.heroMeta}>
                    {o.status || "—"}
                    {o.plan ? ` · ${o.plan}` : ""}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.metrics}>
              {[
                { key: "imp", label: t("boosts_impressions"), value: String(o.impressions) },
                { key: "clk", label: t("boosts_clicks"), value: String(o.clicks) },
                { key: "vid", label: t("boost_analytics_videoViews"), value: String(o.videoViews) },
                {
                  key: "ctr",
                  label: t("boost_analytics_ctr"),
                  value: o.ctr != null ? `${o.ctr}%` : "—",
                },
                { key: "spend", label: t("boosts_spent"), value: money(o.spend) },
                { key: "budget", label: t("boosts_budget"), value: money(o.budget) },
              ].map((m) => (
                <View key={m.key} style={styles.metricCard}>
                  <Text style={styles.metricValue}>{m.value}</Text>
                  <Text style={styles.metricLabel}>{m.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.seriesCard}>
              <Text style={styles.seriesTitle}>{t("boost_analytics_daily")}</Text>
              {(data?.series.length ?? 0) === 0 ? (
                <Text style={styles.seriesEmpty}>{t("boost_analytics_noSeries")}</Text>
              ) : (
                <View style={styles.bars}>
                  {(data?.series ?? []).slice(-14).map((p) => {
                    const h = Math.max(4, Math.round((p.impressions / maxImpressions) * 72));
                    return (
                      <View key={p.date} style={styles.barCol}>
                        <View style={[styles.bar, { height: h }]} />
                        <Text style={styles.barCap}>
                          {p.date.slice(5) || p.date}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
              {(data?.series.length ?? 0) > 0 ? (
                <Text style={styles.seriesHint}>
                  {tr(t, "boost_analytics_lastDays", { n: Math.min(14, data?.series.length ?? 0) })}
                </Text>
              ) : null}
            </View>

            {o.listingId ? (
              <Pressable
                style={styles.linkBtn}
                onPress={() => router.push(`/listing/${o.listingId}` as never)}
              >
                <Feather name="external-link" size={16} color="#F97316" />
                <Text style={styles.linkBtnText}>{t("boost_analytics_openListing")}</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 8,
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
  topTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  hero: { borderRadius: 18, padding: 16 },
  heroRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  heroThumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)" },
  heroThumbFallback: { alignItems: "center", justifyContent: "center" },
  heroTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  heroMeta: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "700", marginTop: 4, textTransform: "capitalize" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metricCard: {
    width: "31.5%",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  metricValue: { fontSize: 15, fontWeight: "900", color: "#0F172A" },
  metricLabel: { fontSize: 10, fontWeight: "700", color: "#64748B", marginTop: 4, textAlign: "center" },
  seriesCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 12,
  },
  seriesTitle: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  seriesEmpty: { fontSize: 13, color: "#94A3B8", fontWeight: "600" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 4, minHeight: 90 },
  barCol: { flex: 1, alignItems: "center", gap: 4 },
  bar: { width: "100%", maxWidth: 18, borderRadius: 4, backgroundColor: "#F97316" },
  barCap: { fontSize: 8, color: "#94A3B8", fontWeight: "700" },
  seriesHint: { fontSize: 11, color: "#94A3B8", fontWeight: "600" },
  linkBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#FDBA74",
    backgroundColor: "#FFF7ED",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  linkBtnText: { color: "#C2410C", fontWeight: "800", fontSize: 13 },
  errorBox: { backgroundColor: "#FEF2F2", borderRadius: 12, padding: 14, gap: 8 },
  errorText: { color: "#B91C1C", fontWeight: "700" },
  retry: { color: "#F97316", fontWeight: "800" },
});
