/**
 * Native Admin Control Center hub — role-aware tiles + live stats.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAdminMe, fetchAdminStats } from "@/lib/adminApi";
import {
  canAccessAdminCenter,
  canAccessFinance,
  canModerate,
  isSuperAdminUser,
  type AdminMe,
} from "@/lib/adminRoles";

type Tile = {
  title: string;
  subtitle: string;
  href: string;
  icon: keyof typeof Feather.glyphMap;
  show: boolean;
};

export default function AdminHubScreen() {
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [stats, setStats] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [adminMe, st] = await Promise.all([
        fetchAdminMe({ token }),
        fetchAdminStats({ token }).catch(() => null),
      ]);
      setMe(adminMe);
      setStats(st);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, t]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && !canAccessAdminCenter(user)) {
        router.replace("/(tabs)/profile");
        return;
      }
      if (token) void load();
    }, [authLoading, token, user, router, load]),
  );

  const tiles: Tile[] = [
    {
      title: t("adminUsers"),
      subtitle: t("adminUsersHint"),
      href: "/admin/users",
      icon: "users",
      show: canModerate(user) || !!me?.permissions?.users,
    },
    {
      title: t("adminModeration"),
      subtitle: t("adminModerationHint"),
      href: "/admin/moderation",
      icon: "shield",
      show: canModerate(user),
    },
    {
      title: t("adminReports"),
      subtitle: t("adminReportsHint"),
      href: "/admin/reports",
      icon: "flag",
      show: canModerate(user) || !!me?.permissions?.reports,
    },
    {
      title: t("adminOrders"),
      subtitle: t("adminOrdersHint"),
      href: "/admin/orders",
      icon: "package",
      show: canAccessFinance(user) || !!user?.isAdmin || isSuperAdminUser(user),
    },
    {
      title: t("adminDeliveries"),
      subtitle: t("adminDeliveriesHint"),
      href: "/admin/deliveries",
      icon: "truck",
      show: !!user?.isAdmin || isSuperAdminUser(user),
    },
    {
      title: t("adminBoosts"),
      subtitle: t("adminBoostsHint"),
      href: "/admin/boosts",
      icon: "zap",
      show: !!user?.isAdmin || isSuperAdminUser(user),
    },
    {
      title: t("adminVideos"),
      subtitle: t("adminVideosHint"),
      href: "/admin/videos",
      icon: "film",
      show: !!user?.isAdmin || isSuperAdminUser(user),
    },
    {
      title: t("adminFinance"),
      subtitle: t("adminFinanceHint"),
      href: "/admin/finance",
      icon: "dollar-sign",
      show: canAccessFinance(user),
    },
    {
      title: t("adminAudit"),
      subtitle: t("adminAuditHint"),
      href: "/admin/audit",
      icon: "file-text",
      show: !!user?.isAdmin || isSuperAdminUser(user) || canModerate(user),
    },
    {
      title: t("adminTraffic"),
      subtitle: t("adminTrafficHint"),
      href: "/admin/traffic",
      icon: "activity",
      show: !!user?.isAdmin || isSuperAdminUser(user),
    },
    {
      title: t("adminTeam"),
      subtitle: t("adminTeamHint"),
      href: "/admin/team",
      icon: "award",
      show: isSuperAdminUser(user),
    },
    {
      title: t("adminKyc"),
      subtitle: t("adminKycHint"),
      href: "/admin/kyc",
      icon: "check-circle",
      show: canModerate(user) || !!user?.isAdmin || isSuperAdminUser(user),
    },
    {
      title: t("adminOperations"),
      subtitle: t("adminOperationsHint"),
      href: "/admin/operations",
      icon: "list",
      show: canModerate(user) || !!user?.isAdmin || isSuperAdminUser(user),
    },
    {
      title: t("adminAppeals"),
      subtitle: t("adminAppealsHint"),
      href: "/admin/appeals",
      icon: "shield",
      show: canModerate(user) || !!user?.isAdmin || isSuperAdminUser(user),
    },
    {
      title: t("adminDrivers"),
      subtitle: t("adminDriversHint"),
      href: "/admin/drivers",
      icon: "truck",
      show: !!user?.isAdmin || isSuperAdminUser(user),
    },
    {
      title: t("adminAgents"),
      subtitle: t("adminAgentsHint"),
      href: "/admin/agents",
      icon: "briefcase",
      show: !!user?.isAdmin || isSuperAdminUser(user),
    },
    {
      title: t("adminStripe"),
      subtitle: t("adminStripeHint"),
      href: "/admin/stripe",
      icon: "credit-card",
      show: isSuperAdminUser(user),
    },
    {
      title: t("adminReturns"),
      subtitle: t("adminReturnsHint"),
      href: "/admin/returns",
      icon: "rotate-ccw",
      show: canAccessFinance(user) || !!user?.isAdmin || isSuperAdminUser(user),
    },
    {
      title: t("adminFraud"),
      subtitle: t("adminFraudHint"),
      href: "/admin/fraud",
      icon: "alert-triangle",
      show: !!user?.isAdmin || isSuperAdminUser(user),
    },
    {
      title: t("adminCommissions"),
      subtitle: t("adminCommissionsHint"),
      href: "/admin/commissions",
      icon: "pie-chart",
      show: isSuperAdminUser(user),
    },
    {
      title: t("adminFlexCards"),
      subtitle: t("adminFlexCardsHint"),
      href: "/admin/flex-cards",
      icon: "credit-card",
      show: canAccessFinance(user) || isSuperAdminUser(user),
    },
    {
      title: t("adminLoans"),
      subtitle: t("adminLoansHint"),
      href: "/admin/loans-admin",
      icon: "book",
      show: canAccessFinance(user) || isSuperAdminUser(user),
    },
    {
      title: t("adminFlagged"),
      subtitle: t("adminFlaggedHint"),
      href: "/admin/flagged",
      icon: "alert-circle",
      show: canModerate(user) || !!user?.isAdmin || isSuperAdminUser(user),
    },
    {
      title: t("adminVipSubs"),
      subtitle: t("adminVipSubsHint"),
      href: "/admin/subscriptions",
      icon: "star",
      show: isSuperAdminUser(user),
    },
    {
      title: t("adminFeeSettings"),
      subtitle: t("adminFeesHint"),
      href: "/admin/fees",
      icon: "sliders",
      show: isSuperAdminUser(user),
    },
    {
      title: t("adminHaitiLedger"),
      subtitle: t("adminHaitiLedgerHint"),
      href: "/admin/haiti-ledger",
      icon: "book-open",
      show: isSuperAdminUser(user),
    },
    {
      title: t("adminBroadcast"),
      subtitle: t("adminBroadcastHint"),
      href: "/admin/broadcast",
      icon: "mail",
      show: isSuperAdminUser(user),
    },
    {
      title: t("adminPushCampaigns"),
      subtitle: t("adminPushHint"),
      href: "/admin/push-campaigns",
      icon: "bell",
      show: isSuperAdminUser(user),
    },
    {
      title: t("adminTvCms"),
      subtitle: t("adminTvCmsHint"),
      href: "/admin/tv-cms",
      icon: "monitor",
      show: !!user?.isAdmin || isSuperAdminUser(user),
    },
    {
      title: t("adminMusicCms"),
      subtitle: t("adminMusicCmsHint"),
      href: "/admin/music-cms",
      icon: "music",
      show: !!user?.isAdmin || isSuperAdminUser(user),
    },
    {
      title: t("adminSecurity"),
      subtitle: t("adminSecurityHint"),
      href: "/admin/security",
      icon: "lock",
      show: !!user?.isAdmin || isSuperAdminUser(user),
    },
    {
      title: t("adminSettings"),
      subtitle: t("adminSettingsHint"),
      href: "/admin/settings",
      icon: "settings",
      show: true,
    },
    {
      title: t("supportAdminDesk"),
      subtitle: t("adminSupportHint"),
      href: "/support-admin",
      icon: "headphones",
      show: true,
    },
    {
      title: t("supportAgentDesk"),
      subtitle: t("adminAgentDeskHint"),
      href: "/support-agent",
      icon: "message-circle",
      show: true,
    },
  ];

  return (
    <AdminShell
      title={t("adminTitle")}
      loading={loading && !stats}
      error={error}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <View style={styles.identity}>
        <Text style={styles.identityName}>{me?.name || user?.name || "Staff"}</Text>
        <Text style={styles.identityMeta}>
          {(me?.role || user?.role || "staff").toUpperCase()}
          {me?.scopeCountry ? ` · ${me.scopeCountry}` : ""}
          {me?.scopeLevel ? ` · ${me.scopeLevel}` : ""}
        </Text>
      </View>

      {stats ? (
        <View style={adminStyles.metricGrid}>
          <Metric label={t("adminStatUsers")} value={stats.totalUsers} />
          <Metric label={t("adminStatListings")} value={stats.totalListings ?? stats.activeListings} />
          <Metric label={t("adminStatReports")} value={stats.pendingReports} />
          <Metric label={t("adminStatVisitsToday")} value={stats.visitsToday} />
          <Metric label={t("adminStatBanned")} value={stats.bannedUsers} />
          <Metric label={t("adminStatFlagged")} value={stats.flaggedUsers} />
        </View>
      ) : null}

      <Text style={adminStyles.section}>{t("adminModules")}</Text>
      {tiles
        .filter((x) => x.show)
        .map((tile) => (
          <Pressable key={tile.href} style={adminStyles.card} onPress={() => router.push(tile.href as any)}>
            <View style={adminStyles.row}>
              <Feather name={tile.icon} size={18} color="#F97316" />
              <View style={{ flex: 1 }}>
                <Text style={adminStyles.cardTitle}>{tile.title}</Text>
                <Text style={adminStyles.cardSub}>{tile.subtitle}</Text>
              </View>
              <Feather name="chevron-right" size={16} color="#94A3B8" />
            </View>
          </Pressable>
        ))}
    </AdminShell>
  );
}

function Metric({ label, value }: { label: string; value: any }) {
  return (
    <View style={adminStyles.metric}>
      <Text style={adminStyles.metricVal}>{value ?? "—"}</Text>
      <Text style={adminStyles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    padding: 14,
    marginBottom: 4,
  },
  identityName: { color: "#fff", fontWeight: "900", fontSize: 17 },
  identityMeta: { color: "#94A3B8", marginTop: 4, fontSize: 12, fontWeight: "600" },
});
