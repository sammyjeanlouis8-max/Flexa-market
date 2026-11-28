import { useRouter } from "expo-router";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BeautyShell } from "@/components/beauty/BeautyShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchBeautyBusinesses, type BeautyBusiness } from "@/lib/beautyApi";
import { beautyTheme as T } from "@/lib/beautyTheme";

const TYPES = [
  { id: "all", labelKey: "beauty_catAll" },
  { id: "beauty_studio", labelKey: "beauty_catStudio" },
  { id: "barbershop", labelKey: "beauty_catBarbershop" },
  { id: "independent_beauty", labelKey: "beauty_catIndependent" },
  { id: "mobile_beauty", labelKey: "beauty_catMobile" },
] as const;

export default function BeautyDiscoverScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [businessType, setBusinessType] = useState("all");
  const [openNow, setOpenNow] = useState(false);
  const [rows, setRows] = useState<BeautyBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<"auth" | "restricted" | "load" | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          setLat(pos.coords.latitude);
          setLng(pos.coords.longitude);
        }
      } catch {
        /* country browse still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(
        await fetchBeautyBusinesses(
          {
            q: q.trim() || undefined,
            country: user?.country,
            businessType: businessType === "all" ? undefined : businessType,
            openNow: openNow || undefined,
            nearby: lat != null && lng != null,
            radiusKm: lat != null && lng != null ? 40 : undefined,
            lat: lat ?? undefined,
            lng: lng ?? undefined,
            sortBy: lat != null && lng != null ? "distance" : "rating",
          },
          { token },
        ),
      );
    } catch (e: any) {
      const raw = String(e?.message || "");
      if (/401|unauthorized/i.test(raw)) setError("auth");
      else if (/403|restricted|disabled|preview|country/i.test(raw)) setError("restricted");
      else setError("load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, user?.country, q, businessType, openNow, lat, lng]);

  useEffect(() => {
    const id = setTimeout(() => {
      void load();
    }, 200);
    return () => clearTimeout(id);
  }, [load]);

  return (
    <BeautyShell title={t("beauty_discoverTitle")} subtitle={t("beauty_discoverSubtitle")} scroll={false}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
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
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <TextInput
          style={styles.input}
          placeholder={t("beauty_searchPlaceholder")}
          placeholderTextColor={T.muted}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
          {TYPES.map((type) => {
            const active = businessType === type.id;
            return (
              <Pressable
                key={type.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setBusinessType(type.id)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(type.labelKey)}</Text>
              </Pressable>
            );
          })}
          <Pressable
            style={[styles.chip, openNow && styles.chipActive]}
            onPress={() => setOpenNow((v) => !v)}
          >
            <Text style={[styles.chipText, openNow && styles.chipTextActive]}>{t("beauty_openNow")}</Text>
          </Pressable>
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.err}>
            {error === "auth"
              ? t("common_sessionExpired")
              : error === "restricted"
                ? t("beauty_staffPreviewOnly")
                : t("beauty_loadError")}
          </Text>
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
                    {r.openNow ? t("beauty_openNow") : t("beauty_closed")}
                    {r.distanceKm != null ? ` · ${r.distanceKm} km` : ` · ${r.city}`}
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
  input: {
    backgroundColor: T.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: T.ink,
    marginBottom: 10,
  },
  chips: { marginBottom: 10, maxHeight: 44 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: T.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginRight: 8,
  },
  chipActive: { backgroundColor: T.accent, borderColor: T.accent },
  chipText: { color: T.ink, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: T.white },
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
