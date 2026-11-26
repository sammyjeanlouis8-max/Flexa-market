/**
 * Native Admin Control Center hub — stats + section grid matching web IA.
 * Deep admin tools stay on flexamarket.com; this hub is native (no WebView).
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
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
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { friendlyApiError, tr } from "@/i18n/nativeScreens";
import { fetchAdminStats, type AdminStats } from "@/lib/adminApi";

type IconName = React.ComponentProps<typeof Feather>["name"];

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <View style={[styles.statCard, accent ? { borderColor: accent } : null]}>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const c = colors.light;

  const isAdmin = Boolean(user?.isAdmin || (user as any)?.isSuperAdmin);

  const sections = useMemo(
    () =>
      [
        {
          key: "support",
          title: t("admin_support"),
          subtitle: t("admin_supportSub"),
          icon: "message-circle" as IconName,
          href: "/support",
        },
        {
          key: "listings",
          title: t("admin_listingsSec"),
          subtitle: t("admin_listingsSub"),
          icon: "package" as IconName,
          href: "/my-listings",
        },
        {
          key: "boosts",
          title: t("admin_boosts"),
          subtitle: t("admin_boostsSub"),
          icon: "zap" as IconName,
          href: "/my-boosts",
        },
        {
          key: "videos",
          title: t("admin_videos"),
          subtitle: t("admin_videosSub"),
          icon: "film" as IconName,
          href: "/videos",
        },
        {
          key: "drivers",
          title: t("admin_drivers"),
          subtitle: t("admin_driversSub"),
          icon: "truck" as IconName,
          href: "/driver-dashboard",
        },
        {
          key: "wholesale",
          title: t("admin_wholesale"),
          subtitle: t("admin_wholesaleSub"),
          icon: "layers" as IconName,
          href: "/wholesale/admin",
        },
      ] as const,
    [t],
  );

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token || !isAdmin) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const s = await fetchAdminStats({ token });
        setStats(s);
        setError(null);
      } catch (e) {
        setError(
          friendlyApiError(e instanceof Error ? e.message : undefined, t) || t("admin_loadError"),
        );
      } finally {
        setRefreshing(false);
      }
    },
    [token, isAdmin, t],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && isAdmin) void load("initial");
    }, [authLoading, token, isAdmin, router, load]),
  );

  if (!authLoading && token && !isAdmin) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12, backgroundColor: c.background }]}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Feather name="arrow-left" size={22} color={c.foreground} />
        </Pressable>
        <View style={styles.denied}>
          <Feather name="shield-off" size={36} color="#EF4444" />
          <Text style={styles.deniedTitle}>{t("admin_deniedTitle")}</Text>
          <Text style={styles.deniedSub}>{t("admin_deniedBody")}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, backgroundColor: c.background }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={styles.back}
        >
          <Feather name="arrow-left" size={22} color={c.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>{t("admin_title")}</Text>
          <Text style={styles.topSub}>{t("admin_subtitle")}</Text>
        </View>
        <Pressable onPress={() => void load("refresh")} style={styles.iconBtn}>
          <Feather name="refresh-cw" size={18} color={c.foreground} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, gap: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor="#146C43" />
        }
      >
        {stats?.scopeCountry ? (
          <View style={styles.scopePill}>
            <Feather name="map-pin" size={14} color="#146C43" />
            <Text style={styles.scopeText}>
              {tr(t, "admin_scope", {
                scope: `${stats.scopeCountry}${stats.scopeLevel ? ` · ${stats.scopeLevel}` : ""}`,
              })}
            </Text>
          </View>
        ) : null}

        {!stats && !error ? (
          <ActivityIndicator color="#146C43" style={{ marginTop: 40 }} />
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {stats ? (
          <View style={styles.statsGrid}>
            <StatCard label={t("admin_users")} value={stats.totalUsers} />
            <StatCard label={t("admin_listings")} value={stats.totalListings} accent="#146C43" />
            <StatCard label={t("admin_active")} value={stats.activeListings} accent="#2A9B5C" />
            <StatCard label={t("admin_reports")} value={stats.pendingReports} accent="#F97316" />
            <StatCard label={t("admin_flagged")} value={stats.flaggedUsers} accent="#EA580C" />
            <StatCard label={t("admin_banned")} value={stats.bannedUsers} accent="#EF4444" />
          </View>
        ) : null}

        <Text style={styles.sectionHeading}>{t("admin_sections")}</Text>
        <View style={styles.sectionCard}>
          {sections.map((s, idx) => (
            <Pressable
              key={s.key}
              style={[styles.sectionRow, idx < sections.length - 1 && styles.sectionBorder]}
              onPress={() => s.href && router.push(s.href as any)}
            >
              <View style={styles.sectionIcon}>
                <Feather name={s.icon} size={18} color="#146C43" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>{s.title}</Text>
                <Text style={styles.sectionSub}>{s.subtitle}</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#94A3B8" />
            </Pressable>
          ))}
        </View>

        <View style={styles.note}>
          <Feather name="info" size={16} color="#64748B" />
          <Text style={styles.noteText}>{t("admin_note")}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  topBar: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
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
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  brand: { fontSize: 18, fontWeight: "900", color: "#0F172A", letterSpacing: -0.3 },
  topSub: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  scopePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E8F5EE",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  scopeText: { fontSize: 12, fontWeight: "700", color: "#146C43" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    width: "31%",
    flexGrow: 1,
    minWidth: "30%",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },
  statValue: { fontSize: 20, fontWeight: "900", color: "#0F172A" },
  statLabel: { fontSize: 11, fontWeight: "700", color: "#64748B", marginTop: 2 },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sectionBorder: { borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#E8F5EE",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  sectionSub: { fontSize: 12, color: "#64748B", marginTop: 1 },
  note: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19, color: "#64748B" },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: "#B91C1C", fontSize: 14 },
  denied: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingBottom: 80 },
  deniedTitle: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  deniedSub: { fontSize: 14, color: "#64748B", textAlign: "center", maxWidth: 280 },
});
