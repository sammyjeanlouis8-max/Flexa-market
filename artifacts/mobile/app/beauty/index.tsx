import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BeautyShell } from "@/components/beauty/BeautyShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchBeautyBusinesses, fetchBeautyLaunch, type BeautyBusiness } from "@/lib/beautyApi";
import { beautyTheme as T } from "@/lib/beautyTheme";

const TYPE_CHIPS = [
  { id: "beauty_studio", labelKey: "beauty_catStudio", href: "/beauty/studio" },
  { id: "barbershop", labelKey: "beauty_catBarbershop", href: "/beauty/barbershop" },
] as const;

export default function BeautyHubScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<BeautyBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feeNote, setFeeNote] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const launch = await fetchBeautyLaunch({ token });
      setFeeNote(
        launch.platformFees?.commission === 0
          ? t("beauty_freeLaunchNote")
          : t("beauty_hubSubtitle"),
      );
      setRows(
        await fetchBeautyBusinesses(
          { country: user?.country, sortBy: "rating", limit: 12 },
          { token },
        ),
      );
    } catch (e: any) {
      setError(e?.message || t("beauty_loadError"));
      setRows([]);
    }
  }, [token, user?.country, t]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <BeautyShell title={t("beauty_hubTitle")} subtitle={t("beauty_hubSubtitle")} scroll={false}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={T.accent} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{feeNote || t("beauty_freeLaunchNote")}</Text>
        </View>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{t("beauty_bookingNote")}</Text>
        </View>

        <View style={styles.row}>
          {TYPE_CHIPS.map((c) => (
            <Pressable key={c.id} style={styles.chip} onPress={() => router.push(c.href as any)}>
              <Text style={styles.chipText}>{t(c.labelKey)}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <Pressable style={styles.chipOutline} onPress={() => router.push("/beauty/discover" as any)}>
            <Text style={styles.chipOutlineText}>{t("beauty_tabDiscover")}</Text>
          </Pressable>
          <Pressable style={styles.chipOutline} onPress={() => router.push("/beauty/onboarding" as any)}>
            <Text style={styles.chipOutlineText}>{t("beauty_addBusiness")}</Text>
          </Pressable>
          <Pressable style={styles.chipOutline} onPress={() => router.push("/beauty/center" as any)}>
            <Text style={styles.chipOutlineText}>{t("beauty_tabCenter")}</Text>
          </Pressable>
          <Pressable style={styles.chipOutline} onPress={() => router.push("/beauty/my-appointments" as any)}>
            <Text style={styles.chipOutlineText}>{t("beauty_tabAppointments")}</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <View>
            <Text style={styles.err}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.retry}>
              <Text style={styles.retryText}>{t("common_retry") || "Retry"}</Text>
            </Pressable>
          </View>
        ) : rows.length === 0 ? (
          <Text style={styles.muted}>{t("beauty_emptyTitle")}</Text>
        ) : (
          rows.map((r) => (
            <Pressable key={r.id} style={styles.card} onPress={() => router.push(`/beauty/${r.id}` as any)}>
              <View style={styles.cardRow}>
                <View style={styles.thumb}>
                  {(r.coverUrl || r.logoUrl) ? (
                    <Image source={{ uri: (r.coverUrl || r.logoUrl) as string }} style={styles.thumbImg} />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{r.name}</Text>
                  <Text style={styles.muted}>
                    {(r.avgRating ?? 0) > 0 ? `★ ${(r.avgRating ?? 0).toFixed(1)} · ` : ""}
                    {r.openNow ? t("beauty_openNow") : t("beauty_closed")}
                    {` · ${r.city}, ${r.country}`}
                  </Text>
                  <Text style={styles.typeLabel}>
                    {r.businessType?.replace(/_/g, " ") || ""}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </BeautyShell>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: "rgba(139,69,87,0.1)",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  noticeText: { fontSize: 12, color: T.ink, lineHeight: 17 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 6 },
  chip: { backgroundColor: T.accent, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, minHeight: 40 },
  chipText: { color: T.white, fontWeight: "800", fontSize: 12 },
  chipOutline: {
    backgroundColor: T.white,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    minHeight: 40,
  },
  chipOutlineText: { color: T.ink, fontWeight: "800", fontSize: 12 },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  cardRow: { flexDirection: "row", gap: 12 },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: "rgba(139,69,87,0.08)", overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  cardTitle: { fontWeight: "800", color: T.ink, fontSize: 15 },
  muted: { color: T.muted, fontSize: 12, marginTop: 2 },
  typeLabel: { color: T.accent, fontSize: 11, fontWeight: "700", marginTop: 4, textTransform: "capitalize" },
  err: { color: "#b91c1c", marginTop: 12 },
  retry: { marginTop: 8, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12 },
  retryText: { color: T.accent, fontWeight: "800" },
});
