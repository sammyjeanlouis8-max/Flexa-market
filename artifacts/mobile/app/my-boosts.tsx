/**
 * Native My Boosts — campaign list + cancel (paid create blocked on store apps).
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
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
import { friendlyApiError, tr } from "@/i18n/nativeScreens";
import {
  ActiveBoost,
  cancelBoost,
  daysLeft,
  estimateRefund,
  fetchMyActiveBoosts,
} from "@/lib/boostApi";
import colors from "@/constants/colors";

function money(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function MyBoostsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [boosts, setBoosts] = useState<ActiveBoost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const rows = await fetchMyActiveBoosts({ token });
        setBoosts(rows);
        setError(null);
      } catch (e) {
        setError(friendlyApiError(e instanceof Error ? e.message : undefined, t) || t("boosts_loadError"));
        setBoosts((prev) => prev ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token, t],
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

  const totals = useMemo(() => {
    const list = boosts ?? [];
    const impressions = list.reduce((s, b) => s + b.impressions, 0);
    const views = list.reduce((s, b) => s + b.viewCount, 0);
    const clicks = list.reduce((s, b) => s + b.clicks, 0);
    return { impressions, views, clicks };
  }, [boosts]);

  const onCreate = () => {
    router.push("/my-listings" as never);
  };

  const onCancel = (boost: ActiveBoost) => {
    const refund = estimateRefund(boost);
    Alert.alert(
      t("boosts_cancelTitle"),
      refund > 0
        ? `${boost.title} — ${t("boosts_cancelBody")} (~${money(refund)})`
        : `${boost.title} — ${t("boosts_cancelBody")}`,
      [
        { text: t("common_ok"), style: "cancel" },
        {
          text: t("boosts_cancel"),
          style: "destructive",
          onPress: async () => {
            if (!token) return;
            setCancellingId(boost.boostId);
            try {
              await cancelBoost(boost.boostId, { token });
              Alert.alert(t("common_ok"), t("boosts_cancelBody"));
              await load("refresh");
            } catch (e) {
              Alert.alert(
                t("common_error"),
                friendlyApiError(e instanceof Error ? e.message : undefined, t),
              );
            } finally {
              setCancellingId(null);
            }
          },
        },
      ],
    );
  };

  const renderBoost = ({ item }: { item: ActiveBoost }) => {
    const days = daysLeft(item.boostExpiresAt);
    const expiringSoon = !item.isExpired && days !== null && days <= 1;
    const ctr =
      item.impressions > 0
        ? `${((item.clicks / item.impressions) * 100).toFixed(1)}%`
        : "—";

    return (
      <View style={styles.card} testID={`boost-card-${item.boostId}`}>
        <View style={styles.cardTop}>
          <View style={styles.thumb}>
            {item.thumbnail ? (
              <Image source={{ uri: item.thumbnail }} style={styles.thumbImg} contentFit="cover" />
            ) : (
              <View style={[styles.thumbImg, styles.thumbFallback]}>
                <Feather name="zap" size={22} color="#F97316" />
              </View>
            )}
          </View>
          <View style={styles.cardMeta}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.isExpired ? (
                <View style={[styles.pill, styles.pillMuted]}>
                  <Text style={styles.pillMutedText}>{t("sub_expired")}</Text>
                </View>
              ) : days !== null ? (
                <View style={[styles.pill, expiringSoon ? styles.pillWarn : styles.pillOk]}>
                  <Text style={expiringSoon ? styles.pillWarnText : styles.pillOkText}>
                    {tr(t, "boosts_daysLeft", { n: days })}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statBlue}>{item.impressions.toLocaleString()} {t("boosts_impressions")}</Text>
              <Text style={styles.statOrange}>{item.clicks.toLocaleString()} {t("boosts_clicks")}</Text>
              <Text style={styles.statCtr}>CTR {ctr}</Text>
            </View>
            <View style={styles.budgetRow}>
              <Text style={styles.budgetCell}>{t("boosts_budget")} {money(item.budget)}</Text>
              <Text style={styles.budgetCell}>
                {t("boosts_spent")} {money(item.estimatedSpentUsd ?? 0)}
              </Text>
              <Text style={styles.budgetCell}>
                {t("boosts_remaining")} {money(item.remainingBudgetUsd ?? item.budget)}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable
            style={styles.actionSecondary}
            onPress={() =>
              router.push({
                pathname: "/boost",
                params: { listingId: String(item.listingId) },
              } as never)
            }
          >
            <Feather name="zap" size={14} color={colors.flexaGreen} />
            <Text style={styles.actionSecondaryText}>{t("boost_title")}</Text>
          </Pressable>
          {!item.isExpired ? (
            <Pressable
              style={styles.actionDanger}
              onPress={() => onCancel(item)}
              disabled={cancellingId === item.boostId}
            >
              {cancellingId === item.boostId ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <Feather name="trash-2" size={16} color="#DC2626" />
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="my-boosts-page">
      <LinearGradient
        colors={["#F97316", "#F59E0B", "#EA580C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <Pressable
            style={styles.back}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          >
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <View style={styles.zapBadge}>
            <Feather name="zap" size={16} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{t("boosts_title")}</Text>
            <Text style={styles.headerSub}>{t("boosts_subtitle")}</Text>
          </View>
        </View>
        {(boosts?.length ?? 0) > 0 ? (
          <View style={styles.summary}>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryValue}>{totals.impressions.toLocaleString()}</Text>
              <Text style={styles.summaryLabel}>{t("boosts_impressions")}</Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryValue}>{totals.views.toLocaleString()}</Text>
              <Text style={styles.summaryLabel}>{t("boosts_views")}</Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryValue}>{totals.clicks.toLocaleString()}</Text>
              <Text style={styles.summaryLabel}>{t("boosts_clicks")}</Text>
            </View>
          </View>
        ) : null}
      </LinearGradient>

      {boosts === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={boosts ?? []}
          keyExtractor={(item) => String(item.boostId)}
          renderItem={renderBoost}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 32,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor="#F97316"
            />
          }
          ListHeaderComponent={
            error ? <Text style={styles.error}>{error}</Text> : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Feather name="zap" size={32} color="#F97316" />
              </View>
              <Text style={styles.emptyTitle}>{t("boosts_empty")}</Text>
              <Text style={styles.emptyDesc}>{t("boosts_emptyHint")}</Text>
              <Pressable style={styles.createBtn} onPress={onCreate}>
                <Feather name="zap" size={16} color="#fff" />
                <Text style={styles.createBtnText}>{t("boosts_create")}</Text>
              </Pressable>
              <Text style={styles.createHint}>{t("boosts_createHint")}</Text>
            </View>
          }
          ListFooterComponent={
            (boosts?.length ?? 0) > 0 ? (
              <View style={styles.createAgainWrap}>
                <Pressable style={styles.createAgain} onPress={onCreate}>
                  <Feather name="zap" size={16} color={colors.flexaGreen} />
                  <Text style={styles.createAgainText}>{t("boosts_create")}</Text>
                </Pressable>
                <Text style={styles.createHint}>{t("boosts_createHint")}</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  header: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  zapBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "900" },
  headerSub: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 1 },
  summary: { flexDirection: "row", gap: 8, marginTop: 14 },
  summaryCell: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  summaryValue: { color: "#fff", fontWeight: "900", fontSize: 15 },
  summaryLabel: { color: "rgba(255,255,255,0.75)", fontSize: 10, marginTop: 2 },
  error: { color: "#B91C1C", marginBottom: 8, fontWeight: "600" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 12,
  },
  cardTop: { flexDirection: "row", gap: 12 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#FFF7ED",
  },
  thumbImg: { width: "100%", height: "100%" },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  cardMeta: { flex: 1 },
  titleRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  cardTitle: { flex: 1, fontWeight: "800", color: "#0F172A", fontSize: 14 },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pillMuted: { backgroundColor: "#F1F5F9" },
  pillMutedText: { fontSize: 10, fontWeight: "700", color: "#64748B" },
  pillOk: { backgroundColor: "#DCFCE7" },
  pillOkText: { fontSize: 10, fontWeight: "700", color: "#15803D" },
  pillWarn: { backgroundColor: "#FEE2E2" },
  pillWarnText: { fontSize: 10, fontWeight: "700", color: "#B91C1C" },
  statRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  statBlue: { fontSize: 11, fontWeight: "700", color: "#2563EB" },
  statOrange: { fontSize: 11, fontWeight: "700", color: "#F97316" },
  statCtr: { fontSize: 11, fontWeight: "800", color: "#0F172A" },
  budgetRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  budgetCell: {
    flex: 1,
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    paddingVertical: 6,
    textAlign: "center",
    overflow: "hidden",
  },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  actionSecondary: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionSecondaryText: { fontWeight: "700", color: colors.flexaGreen, fontSize: 12 },
  actionDanger: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 16 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFF7ED",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  emptyDesc: {
    marginTop: 8,
    textAlign: "center",
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19,
  },
  createBtn: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.flexaGreen,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  createBtnText: { color: "#fff", fontWeight: "800" },
  createHint: {
    marginTop: 10,
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 12,
  },
  createAgainWrap: { marginTop: 8 },
  createAgain: {
    height: 48,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#A7F3D0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createAgainText: { color: colors.flexaGreen, fontWeight: "800", fontSize: 13 },
});
