/**
 * Promo / boost videos admin — Super Admin can view All Videos across countries.
 * Uses existing /api/videos/feed with allCountries=1 (no invented endpoints).
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAdminPromoVideos } from "@/lib/adminApi";
import { isSuperAdminUser } from "@/lib/adminRoles";

export default function AdminVideosScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const superAdmin = isSuperAdminUser(user);
  const [allCountries, setAllCountries] = useState(superAdmin);
  const [country, setCountry] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  const [total, setTotal] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchAdminPromoVideos({
        token,
        allCountries: superAdmin && allCountries,
        country: !allCountries && country ? country : undefined,
      });
      setRows(data.videos);
      setTotal(data.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
      setRows((p) => p ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [token, allCountries, country, superAdmin, t]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoading && !token) { router.replace("/auth/login"); return; }
      if (token && !user?.isAdmin && !superAdmin) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, superAdmin, router, load]),
  );

  return (
    <AdminShell
      title={t("adminVideos")}
      loading={rows === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); void load(); }}
    >
      <Text style={adminStyles.cardSub}>{t("adminVideosScopeNote")}</Text>
      {superAdmin ? (
        <View style={[adminStyles.row, { flexWrap: "wrap" }]}>
          <Pressable
            style={[adminStyles.chip, allCountries && adminStyles.chipOn]}
            onPress={() => setAllCountries(true)}
          >
            <Text style={[adminStyles.chipText, allCountries && adminStyles.chipTextOn]}>
              {t("adminAllCountries")}
            </Text>
          </Pressable>
          {["HT", "DO", "US"].map((c) => (
            <Pressable
              key={c}
              style={[adminStyles.chip, !allCountries && country === c && adminStyles.chipOn]}
              onPress={() => {
                setAllCountries(false);
                setCountry(c);
              }}
            >
              <Text
                style={[
                  adminStyles.chipText,
                  !allCountries && country === c && adminStyles.chipTextOn,
                ]}
              >
                {c}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {typeof total === "number" ? (
        <Text style={adminStyles.section}>
          {t("adminVideosTotal")}: {total}
        </Text>
      ) : null}
      {(rows ?? []).map((v) => (
        <View key={v.id} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{v.title || v.description || `Video #${v.id}`}</Text>
          <Text style={adminStyles.cardSub}>
            #{v.id} · {v.country || v.listingCountry || "—"} · {v.status || v.moderationStatus || "—"}
          </Text>
          <Text style={adminStyles.cardSub}>
            {v.sellerName || v.userName || ""}
            {v.views != null ? ` · ${v.views} views` : ""}
          </Text>
        </View>
      ))}
      {rows?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
