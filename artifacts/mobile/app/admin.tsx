/**
 * Native Admin Control Center hub — stats + section grid matching web IA.
 * Deep admin tools stay on flexamarket.com; this hub is native (no WebView).
 */
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
import { canAccessAdminHub, fetchAdminStats, type AdminStats } from "@/lib/adminApi";

type IconName = React.ComponentProps<typeof Feather>["name"];

function StatCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: number | string;
  accent: string;
  icon: IconName;
}) {
  return (
    <View style={[styles.statCard, { borderColor: `${accent}33` }]}>
      <View style={[styles.statIcon, { backgroundColor: `${accent}18` }]}>
        <Feather name={icon} size={14} color={accent} />
      </View>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
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

  const isAdmin = canAccessAdminHub(user);

  const sections = useMemo(
    () =>
      [
        {
          key: "moderation",
          title: t("admin_mod_title"),
          subtitle: t("admin_mod_subtitle"),
          icon: "shield" as IconName,
          href: "/admin-moderation",
          tint: "#146C43",
        },
        {
          key: "reports",
          title: t("admin_reports_title"),
          subtitle: t("admin_reports_subtitle"),
          icon: "flag" as IconName,
          href: "/admin-reports",
          tint: "#DC2626",
        },
        {
          key: "support",
          title: t("admin_support"),
          subtitle: t("admin_supportSub"),
          icon: "message-circle" as IconName,
          href: "/support",
          tint: "#0F766E",
        },
        {
          key: "boosts",
          title: t("admin_boosts"),
          subtitle: t("admin_boostsSub"),
          icon: "zap" as IconName,
          href: "/my-boosts",
          tint: "#F97316",
        },
        {
          key: "videos",
          title: t("admin_videos"),
          subtitle: t("admin_videosSub"),
          icon: "film" as IconName,
          href: "/videos",
          tint: "#7C3AED",
        },
        {
          key: "drivers",
          title: t("admin_drivers"),
          subtitle: t("admin_driversSub"),
          icon: "truck" as IconName,
          href: "/driver-dashboard",
          tint: "#2563EB",
        },
        {
          key: "wholesale",
          title: t("admin_wholesale"),
          subtitle: t("admin_wholesaleSub"),
          icon: "layers" as IconName,
          href: "/wholesale/admin",
          tint: "#0EA5E9",
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
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={["#146C43", "#0F5434", "#0A3D26"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerStrip, { paddingTop: insets.top + 10 }]}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            style={styles.backOnGreen}
          >
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <Feather name="shield" size={14} color="#fff" />
              </View>
              <Text style={styles.brand}>{t("admin_title")}</Text>
            </View>
            <Text style={styles.topSub}>{t("admin_subtitle")}</Text>
          </View>
          <Pressable onPress={() => void load("refresh")} style={styles.backOnGreen}>
            <Feather name="refresh-cw" size={18} color="#fff" />
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 32,
          gap: 16,
        }}
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
            <Feather name="alert-circle" size={14} color="#B91C1C" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {stats ? (
          <View style={styles.statsGrid}>
            <StatCard label={t("admin_users")} value={stats.totalUsers} accent="#0F172A" icon="users" />
            <StatCard label={t("admin_listings")} value={stats.totalListings} accent="#146C43" icon="package" />
            <StatCard label={t("admin_active")} value={stats.activeListings} accent="#2A9B5C" icon="check-circle" />
            <StatCard label={t("admin_reports")} value={stats.pendingReports} accent="#F97316" icon="flag" />
            <StatCard label={t("admin_flagged")} value={stats.flaggedUsers} accent="#EA580C" icon="alert-triangle" />
            <StatCard label={t("admin_banned")} value={stats.bannedUsers} accent="#EF4444" icon="slash" />
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
              <View style={[styles.sectionIcon, { backgroundColor: `${s.tint}18` }]}>
                <Feather name={s.icon} size={18} color={s.tint} />
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
          <View style={styles.noteIcon}>
            <Feather name="info" size={14} color="#64748B" />
          </View>
          <Text style={styles.noteText}>{t("admin_note")}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerStrip: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  topBar: { flexDirection: "row", alignItems: "center", gap: 10 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginLeft: 16,
  },
  backOnGreen: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandMark: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { fontSize: 18, fontWeight: "900", color: "#fff", letterSpacing: -0.3 },
  topSub: { fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: "600", marginTop: 2 },
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
    padding: 12,
    gap: 4,
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  statValue: { fontSize: 20, fontWeight: "900" },
  statLabel: { fontSize: 11, fontWeight: "700", color: "#64748B" },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
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
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  sectionSub: { fontSize: 12, color: "#64748B", marginTop: 1 },
  note: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  noteIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#EEF2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19, color: "#64748B" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  errorText: { flex: 1, color: "#B91C1C", fontSize: 14 },
  denied: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingBottom: 80 },
  deniedTitle: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  deniedSub: { fontSize: 14, color: "#64748B", textAlign: "center", maxWidth: 280 },
});
