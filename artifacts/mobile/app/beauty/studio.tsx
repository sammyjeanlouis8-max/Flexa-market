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
import { fetchBeautyBusinesses, type BeautyBusiness } from "@/lib/beautyApi";
import { beautyTheme as T } from "@/lib/beautyTheme";

export default function BeautyStudioScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<BeautyBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(
        await fetchBeautyBusinesses(
          { country: user?.country, businessType: "beauty_studio", sortBy: "rating" },
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

  return (
    <BeautyShell title={t("beauty_catStudio")} subtitle={t("beauty_studioSubtitle")} scroll={false}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
            tintColor={T.accent}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.err}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.muted}>{t("beauty_emptyTitle")}</Text>
        ) : (
          rows.map((r) => (
            <Pressable key={r.id} style={styles.card} onPress={() => router.push(`/beauty/${r.id}` as any)}>
              <View style={styles.row}>
                <View style={styles.thumb}>
                  {(r.coverUrl || r.logoUrl) ? (
                    <Image source={{ uri: (r.coverUrl || r.logoUrl) as string }} style={styles.thumbImg} />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{r.name}</Text>
                  <Text style={styles.muted}>
                    {(r.avgRating ?? 0) > 0 ? `★ ${(r.avgRating ?? 0).toFixed(1)} · ` : ""}
                    {r.city}
                    {r.openNow ? ` · ${t("beauty_openNow")}` : ""}
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
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  row: { flexDirection: "row", gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: "rgba(139,69,87,0.08)", overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  title: { fontWeight: "800", color: T.ink, fontSize: 15 },
  muted: { color: T.muted, fontSize: 12, marginTop: 2 },
  err: { color: "#b91c1c", marginTop: 12 },
});
