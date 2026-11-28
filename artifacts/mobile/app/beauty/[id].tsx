import { useLocalSearchParams, useRouter } from "expo-router";
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
import {
  fetchBeautyBusiness,
  formatBeautyMoney,
  type BeautyBusiness,
  type BeautyService,
} from "@/lib/beautyApi";
import { beautyTheme as T } from "@/lib/beautyTheme";

export default function BeautyBusinessProfileScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const businessId = Number(id);

  const [row, setRow] = useState<BeautyBusiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(businessId)) return;
    setError(null);
    const biz = await fetchBeautyBusiness(businessId, { token });
    setRow(biz);
  }, [businessId, token]);

  useEffect(() => {
    setLoading(true);
    void load()
      .catch((e: Error) => setError(e.message || t("beauty_notFound")))
      .finally(() => setLoading(false));
  }, [load, t]);

  function bookService(service: BeautyService) {
    router.push({
      pathname: "/beauty/book",
      params: {
        businessId: String(businessId),
        serviceId: String(service.id),
      },
    } as any);
  }

  return (
    <BeautyShell
      title={row?.name || t("beauty_hubTitle")}
      subtitle={row ? `${row.city}, ${row.country}` : undefined}
      scroll={false}
    >
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load()
                .catch((e: Error) => setError(e.message))
                .finally(() => setRefreshing(false));
            }}
            tintColor={T.accent}
          />
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.err}>{error}</Text>
        ) : !row ? (
          <Text style={styles.muted}>{t("beauty_notFound")}</Text>
        ) : (
          <>
            <View style={styles.hero}>
              {(row.coverUrl || row.logoUrl) ? (
                <Image source={{ uri: (row.coverUrl || row.logoUrl) as string }} style={styles.heroImg} />
              ) : (
                <View style={[styles.heroImg, styles.heroPlaceholder]} />
              )}
            </View>
            <Text style={styles.name}>{row.name}</Text>
            <Text style={styles.meta}>
              {(row.avgRating ?? 0) > 0 ? `★ ${(row.avgRating ?? 0).toFixed(1)} (${row.ratingCount ?? 0}) · ` : ""}
              {row.openNow ? t("beauty_openNow") : t("beauty_closed")}
              {row.identityVerifiedBadge ? ` · ${t("beauty_verified")}` : ""}
            </Text>
            {row.description ? <Text style={styles.desc}>{row.description}</Text> : null}
            {row.publicAddress || row.phone ? (
              <Text style={styles.meta}>
                {[row.publicAddress, row.phone].filter(Boolean).join(" · ")}
              </Text>
            ) : null}

            <Text style={styles.section}>{t("beauty_services")}</Text>
            {(row.services || []).length === 0 ? (
              <Text style={styles.muted}>{t("beauty_noServices")}</Text>
            ) : (
              (row.services || []).map((svc) => (
                <View key={svc.id} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.svcName}>{svc.name}</Text>
                      <Text style={styles.muted}>
                        {formatBeautyMoney(svc.price, svc.currency)} · {svc.durationMinutes} min
                      </Text>
                      {svc.description ? (
                        <Text style={styles.svcDesc} numberOfLines={2}>{svc.description}</Text>
                      ) : null}
                    </View>
                    <Pressable style={styles.bookBtn} onPress={() => bookService(svc)}>
                      <Text style={styles.bookBtnText}>{t("beauty_book")}</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}

            {(row.professionals || []).length > 0 ? (
              <>
                <Text style={styles.section}>{t("beauty_staff")}</Text>
                {(row.professionals || []).map((pro) => (
                  <View key={pro.id} style={styles.card}>
                    <Text style={styles.svcName}>{pro.fullName}</Text>
                    <Text style={styles.muted}>
                      {[pro.role, pro.yearsExperience ? `${pro.yearsExperience} yrs` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </BeautyShell>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 16, overflow: "hidden", marginBottom: 12, height: 160, backgroundColor: "rgba(139,69,87,0.08)" },
  heroImg: { width: "100%", height: "100%" },
  heroPlaceholder: { backgroundColor: "rgba(139,69,87,0.12)" },
  name: { fontSize: 22, fontWeight: "900", color: T.ink },
  meta: { color: T.muted, fontSize: 13, marginTop: 4 },
  desc: { color: T.ink, fontSize: 14, lineHeight: 20, marginTop: 10 },
  section: { marginTop: 20, marginBottom: 8, fontSize: 16, fontWeight: "800", color: T.ink },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  rowBetween: { flexDirection: "row", alignItems: "center" },
  svcName: { fontWeight: "800", color: T.ink, fontSize: 15 },
  svcDesc: { color: T.muted, fontSize: 12, marginTop: 4 },
  muted: { color: T.muted, fontSize: 12, marginTop: 2 },
  bookBtn: {
    backgroundColor: T.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    minHeight: 40,
    justifyContent: "center",
  },
  bookBtnText: { color: T.white, fontWeight: "800", fontSize: 13 },
  err: { color: "#b91c1c", marginTop: 12 },
});
