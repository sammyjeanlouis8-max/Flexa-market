/**
 * Native Admin Control Center hub — stats + section grid matching web IA.
 * Deep admin tools stay on flexamarket.com; this hub is native (no WebView).
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
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
import { fetchAdminStats, type AdminStats } from "@/lib/adminApi";

type IconName = React.ComponentProps<typeof Feather>["name"];

const SECTIONS: {
  key: string;
  title: string;
  subtitle: string;
  icon: IconName;
  href?: string;
}[] = [
  { key: "support", title: "Support", subtitle: "Tickets & live chat", icon: "message-circle", href: "/support" },
  { key: "listings", title: "Listings", subtitle: "Seller center", icon: "package", href: "/my-listings" },
  { key: "boosts", title: "Boosts", subtitle: "Active campaigns", icon: "zap", href: "/my-boosts" },
  { key: "videos", title: "Videos", subtitle: "Promo discover", icon: "film", href: "/videos" },
  { key: "drivers", title: "Drivers", subtitle: "Driver dashboard", icon: "truck", href: "/driver-dashboard" },
  { key: "wholesale", title: "Wholesale", subtitle: "B2B admin", icon: "layers", href: "/wholesale/admin" },
];

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
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const c = colors.light;

  const isAdmin = Boolean(user?.isAdmin || (user as any)?.isSuperAdmin);

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
        setError(e instanceof Error ? e.message : "Could not load admin stats");
      } finally {
        setRefreshing(false);
      }
    },
    [token, isAdmin],
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
          <Text style={styles.deniedTitle}>Aksè admin refize</Text>
          <Text style={styles.deniedSub}>Ou bezwen dwa moderator / admin pou louvri Control Center.</Text>
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
          <Text style={styles.brand}>Flexa Control</Text>
          <Text style={styles.topSub}>Admin Control Center</Text>
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
              Scope: {stats.scopeCountry}
              {stats.scopeLevel ? ` · ${stats.scopeLevel}` : ""}
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
            <StatCard label="Users" value={stats.totalUsers} />
            <StatCard label="Listings" value={stats.totalListings} accent="#146C43" />
            <StatCard label="Active" value={stats.activeListings} accent="#2A9B5C" />
            <StatCard label="Reports" value={stats.pendingReports} accent="#F97316" />
            <StatCard label="Flagged" value={stats.flaggedUsers} accent="#EA580C" />
            <StatCard label="Banned" value={stats.bannedUsers} accent="#EF4444" />
          </View>
        ) : null}

        <Text style={styles.sectionHeading}>Sections</Text>
        <View style={styles.sectionCard}>
          {SECTIONS.map((s, idx) => (
            <Pressable
              key={s.key}
              style={[styles.sectionRow, idx < SECTIONS.length - 1 && styles.sectionBorder]}
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
          <Text style={styles.noteText}>
            Moderation, team, security, appeals, ak analytics avanse rete sou sit web Flexa Market
            (menm layout Control Center) — app nativ la bay stats rapid ak lyen itil.
          </Text>
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
