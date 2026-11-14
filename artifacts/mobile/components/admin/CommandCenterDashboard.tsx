import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useAdminControl, type PeriodKey } from "@/context/AdminControlContext";
import { COMMAND_MODULES, type AdminModuleDef } from "@/lib/adminModules";
import { COUNTRY_FLAGS } from "@/lib/countries";
import { getCanonicalRole, hasMinRole } from "@/lib/adminAccess";
import { apiRequest } from "@/lib/request";
import colors from "@/constants/colors";

type TrafficResponse = {
  summary: {
    visitsToday?: number;
    visitsYesterday?: number;
    visitsThisWeek?: number;
    visitsLastWeek?: number;
    visitsThisMonth?: number;
    visitsLastMonth?: number;
    visitsAllTime?: number;
    onlineUsers?: number;
    activeSessions?: number;
    activeNow?: number;
    rangeUniqueVisitors?: number;
    rangeSessions?: number;
    rangePageViews?: number;
    rangeProductViews?: number;
    guestVisitors?: number;
    registeredVisitors?: number;
  };
  series?: { date: string; visits: number }[];
  countries?: { country: string; visitors: number }[];
  note?: string;
};

type PlatformRevenue = {
  summary?: { totalRevenue?: number; orderCount?: number };
};

function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString();
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function moduleVisible(
  mod: AdminModuleDef,
  role: ReturnType<typeof getCanonicalRole>,
  can: (p: string) => boolean,
  isSuper: boolean,
): boolean {
  if (mod.superAdminOnly && !isSuper) return false;
  if (mod.hideFromModerator && role === "moderator") return false;
  if (mod.hideFromSupport && role === "support") return false;
  if (mod.minRole && !hasMinRole({ role }, mod.minRole)) return false;
  if (mod.perm && !can(mod.perm) && !isSuper) return false;
  return true;
}

function KpiTile({
  label,
  value,
  delta,
  tone,
  icon,
}: {
  label: string;
  value: string;
  delta?: number | null;
  tone: "green" | "blue" | "orange" | "purple";
  icon: React.ComponentProps<typeof Feather>["name"];
}) {
  const tones = {
    green: { bg: "#ECFDF5", border: "#A7F3D0", fg: "#064E3B", iconBg: "#059669" },
    blue: { bg: "#F0F9FF", border: "#BAE6FD", fg: "#0C4A6E", iconBg: "#0284C7" },
    orange: { bg: "#FFF7ED", border: "#FED7AA", fg: "#7C2D12", iconBg: "#F97316" },
    purple: { bg: "#F5F3FF", border: "#DDD6FE", fg: "#4C1D95", iconBg: "#7C3AED" },
  }[tone];
  return (
    <View style={[styles.kpi, { backgroundColor: tones.bg, borderColor: tones.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.kpiLabel, { color: tones.fg }]}>{label}</Text>
        <Text style={[styles.kpiValue, { color: tones.fg }]}>{value}</Text>
        {delta != null ? (
          <Text style={styles.kpiDelta}>
            ↗ {delta >= 0 ? "+" : ""}
            {delta}%
          </Text>
        ) : null}
      </View>
      <View style={[styles.kpiIcon, { backgroundColor: tones.iconBg }]}>
        <Feather name={icon} size={16} color="#fff" />
      </View>
    </View>
  );
}

function SimpleChart({ series }: { series: { date: string; visits: number }[] }) {
  const max = Math.max(1, ...series.map((s) => s.visits));
  if (!series.length) {
    return <Text style={styles.muted}>No visitor series for this period.</Text>;
  }
  const barMax = 100;
  return (
    <View style={styles.chartRow}>
      {series.slice(-12).map((s) => {
        const h = Math.max(6, Math.round((s.visits / max) * barMax));
        return (
          <View key={s.date} style={styles.chartCol}>
            <View style={styles.chartBarTrack}>
              <View style={[styles.chartBar, { height: h }]} />
            </View>
            <Text style={styles.chartTick}>{s.date.slice(5)}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function CommandCenterDashboard() {
  const router = useRouter();
  const { token } = useAuth();
  const {
    me,
    role,
    roleLabel,
    isSuperAdmin,
    can,
    selectedCountry,
    setSelectedCountry,
    effectiveCountry,
    pickerCountries,
    canSelectAll,
    period,
    setPeriod,
    isModerator,
  } = useAdminControl();

  const [traffic, setTraffic] = useState<TrafficResponse | null>(null);
  const [revenue, setRevenue] = useState<PlatformRevenue | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countryOpen, setCountryOpen] = useState(false);

  const periodDays = period === "today" ? 1 : period === "7d" ? 7 : period === "30d" ? 30 : 365;

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const tasks: Promise<void>[] = [];
        tasks.push(
          apiRequest(`/admin/stats`, { token })
            .then((s) => setStats(s))
            .catch(() => setStats(null)),
        );
        if (!isModerator) {
          tasks.push(
            apiRequest<TrafficResponse>(
              `/admin/analytics/traffic?period=${period}&days=${periodDays}`,
              { token },
            )
              .then((t) => setTraffic(t))
              .catch(() => setTraffic(null)),
          );
        }
        if (isSuperAdmin) {
          const revPeriod =
            period === "today" ? "today" : period === "7d" ? "week" : period === "year" ? "all" : "month";
          tasks.push(
            apiRequest<PlatformRevenue>(`/admin/platform-revenue?period=${revPeriod}`, { token })
              .then((r) => setRevenue(r))
              .catch(() => setRevenue(null)),
          );
        } else {
          setRevenue(null);
        }
        await Promise.all(tasks);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, period, periodDays, isModerator, isSuperAdmin],
  );

  useEffect(() => {
    void load();
  }, [load, effectiveCountry]);

  const summary = traffic?.summary;
  const visitors =
    period === "today"
      ? summary?.visitsToday ?? 0
      : period === "7d"
        ? summary?.visitsThisWeek ?? summary?.rangeUniqueVisitors ?? 0
        : period === "30d"
          ? summary?.visitsThisMonth ?? summary?.rangeUniqueVisitors ?? 0
          : summary?.visitsAllTime ?? summary?.rangeUniqueVisitors ?? 0;
  const visitorsPrev =
    period === "today"
      ? summary?.visitsYesterday ?? 0
      : period === "7d"
        ? summary?.visitsLastWeek ?? 0
        : summary?.visitsLastMonth ?? 0;

  const guests = summary?.guestVisitors ?? 0;
  const registered = summary?.registeredVisitors ?? 0;
  const guestRegTotal = Math.max(guests + registered, 1);
  const guestPct = Math.round((guests / guestRegTotal) * 100);
  const regPct = Math.max(0, 100 - guestPct);
  const countries = traffic?.countries ?? [];
  const countryTotal = Math.max(
    countries.reduce((a, c) => a + Number(c.visitors || 0), 0),
    1,
  );

  const modules = useMemo(
    () => COMMAND_MODULES.filter((m) => moduleVisible(m, role, can, isSuperAdmin)),
    [role, can, isSuperAdmin],
  );

  const todayLabel = new Date().toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const scopeCaption = canSelectAll
    ? selectedCountry
      ? selectedCountry
      : "All Countries"
    : effectiveCountry || me?.scopeLevel || "Assigned scope";

  return (
    <ScrollView
      contentContainerStyle={styles.pad}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load("refresh")}
          tintColor={colors.flexaGreen}
        />
      }
    >
      <Text style={styles.pageTitle}>Marketplace command overview</Text>
      <Text style={styles.pageSub}>
        {roleLabel} — {isSuperAdmin ? "full access" : scopeCaption}
      </Text>

      <View style={styles.contextBar}>
        <View style={styles.rolePill}>
          <Feather name="shield" size={12} color="#fff" />
          <Text style={styles.rolePillText}>{roleLabel}</Text>
        </View>
        {canSelectAll ? (
          <Pressable style={styles.countryPill} onPress={() => setCountryOpen((v) => !v)}>
            <Feather name="globe" size={14} color="#0F172A" />
            <Text style={styles.countryPillText}>
              {selectedCountry
                ? `${COUNTRY_FLAGS[selectedCountry] ?? ""} ${selectedCountry}`
                : "🌍 All Countries"}
            </Text>
            <Feather name="chevron-down" size={14} color="#64748B" />
          </Pressable>
        ) : effectiveCountry ? (
          <Text style={styles.lockedCountry}>
            {COUNTRY_FLAGS[effectiveCountry] ?? ""} {effectiveCountry}
          </Text>
        ) : null}
        <Text style={styles.dateLabel}>{todayLabel}</Text>
      </View>

      {countryOpen && canSelectAll ? (
        <View style={styles.countryMenu}>
          <Pressable
            style={styles.countryItem}
            onPress={() => {
              setSelectedCountry(null);
              setCountryOpen(false);
            }}
          >
            <Text style={styles.countryItemText}>🌍 All Countries</Text>
          </Pressable>
          {pickerCountries.map((c) => (
            <Pressable
              key={c}
              style={styles.countryItem}
              onPress={() => {
                setSelectedCountry(c);
                setCountryOpen(false);
              }}
            >
              <Text style={styles.countryItemText}>
                {COUNTRY_FLAGS[c] ?? ""} {c}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={styles.hint}>
        Live and delayed metrics from instrumented Flexa Market services. Missing analytics are
        labeled — never estimated.
      </Text>
      <View style={styles.realBadge}>
        <Text style={styles.realBadgeText}>REAL DATA ONLY</Text>
      </View>

      <View style={styles.periodRow}>
        {(
          [
            ["today", "Today"],
            ["7d", "7 Days"],
            ["30d", "30 Days"],
            ["year", "Year"],
          ] as [PeriodKey, string][]
        ).map(([id, label]) => (
          <Pressable
            key={id}
            style={[styles.periodChip, period === id && styles.periodChipOn]}
            onPress={() => setPeriod(id)}
          >
            <Text style={[styles.periodText, period === id && styles.periodTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()}>
            <Text style={styles.retry}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.kpiGrid}>
            <KpiTile
              label="VISITORS"
              value={fmtInt(visitors)}
              delta={pctDelta(Number(visitors), Number(visitorsPrev))}
              tone="green"
              icon="users"
            />
            <KpiTile
              label="ACTIVE NOW"
              value={fmtInt(
                summary?.activeNow ??
                  summary?.activeSessions ??
                  summary?.onlineUsers ??
                  stats?.onlineUsers,
              )}
              tone="blue"
              icon="wifi"
            />
            <KpiTile
              label="ORDERS"
              value={fmtInt(revenue?.summary?.orderCount ?? stats?.totalOrders)}
              tone="orange"
              icon="shopping-bag"
            />
            <KpiTile
              label="REVENUE"
              value={isSuperAdmin ? fmtMoney(revenue?.summary?.totalRevenue) : "—"}
              tone="purple"
              icon="dollar-sign"
            />
          </View>

          {!isModerator ? (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Visitors Overview</Text>
                  <Text style={styles.muted}>
                    Unique visitors (guests + registered). Refreshes are not new uniques.
                  </Text>
                </View>
                <View style={styles.miniPill}>
                  <Text style={styles.miniPillText}>
                    {period === "today" ? "Today" : period}
                  </Text>
                </View>
              </View>
              <SimpleChart series={traffic?.series ?? []} />
              <View style={styles.statPills}>
                {[
                  ["SESSIONS", summary?.rangeSessions],
                  ["PAGE VIEWS", summary?.rangePageViews],
                  ["PRODUCT VIEWS", summary?.rangeProductViews],
                  ["ONLINE USERS", summary?.onlineUsers],
                ].map(([label, value]) => (
                  <View key={String(label)} style={styles.statPill}>
                    <Text style={styles.statPillLabel}>{label}</Text>
                    <Text style={styles.statPillValue}>{fmtInt(value as number)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {!isModerator ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Traffic Breakdown</Text>
              {[
                ["Guests", guests, guestPct, "#6EE7B7"],
                ["Registered", registered, regPct, colors.flexaGreen],
              ].map(([label, count, pct, bar]) => (
                <View key={String(label)} style={{ marginTop: 10 }}>
                  <View style={styles.breakRow}>
                    <Text style={styles.breakLabel}>{label as string}</Text>
                    <Text style={styles.muted}>
                      {fmtInt(count as number)}{" "}
                      <Text style={{ fontWeight: "800", color: "#0F172A" }}>({pct as number}%)</Text>
                    </Text>
                  </View>
                  <View style={styles.breakTrack}>
                    <View
                      style={[
                        styles.breakFill,
                        {
                          width: `${Math.min(100, Math.max(0, pct as number))}%`,
                          backgroundColor: bar as string,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {!isModerator ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Top Countries (Visitors)</Text>
              {countries.length === 0 ? (
                <Text style={styles.muted}>
                  Country distribution appears as visitor beacons collect geo signals.
                </Text>
              ) : (
                countries.slice(0, 5).map((c) => {
                  const pct = Math.round((Number(c.visitors) / countryTotal) * 1000) / 10;
                  return (
                    <View key={c.country} style={styles.countryRow}>
                      <Text style={{ width: 28, fontSize: 16 }}>
                        {COUNTRY_FLAGS[c.country] ?? "🌍"}
                      </Text>
                      <Text style={[styles.breakLabel, { flex: 1 }]}>{c.country}</Text>
                      <Text style={styles.muted}>{fmtInt(c.visitors)}</Text>
                      <Text style={styles.pct}>{pct}%</Text>
                    </View>
                  );
                })
              )}
            </View>
          ) : null}

          <Pressable
            style={styles.pushCta}
            onPress={() => router.push("/admin/push-notifications")}
          >
            <View style={styles.pushIcon}>
              <Feather name="send" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pushTitle}>Send Push Notification</Text>
              <Text style={styles.muted}>Target by country, region or all users.</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.flexaGreen} />
          </Pressable>

          <Text style={[styles.cardTitle, { marginTop: 8 }]}>Modules</Text>
          {modules.map((m) => (
            <Pressable
              key={m.slug}
              style={styles.moduleRow}
              onPress={() => router.push(m.href as any)}
            >
              <View style={[styles.moduleIcon, { backgroundColor: m.color }]}>
                <Feather name={m.icon} size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.moduleTitle}>{m.title}</Text>
                <Text style={styles.muted}>{m.desc}</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#94A3B8" />
            </Pressable>
          ))}

          {traffic?.note ? <Text style={styles.note}>{traffic.note}</Text> : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 40, gap: 10 },
  pageTitle: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
  pageSub: { color: "#64748B", marginTop: -4, marginBottom: 4 },
  contextBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
  },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.flexaGreen,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  rolePillText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  countryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  countryPillText: { fontWeight: "700", fontSize: 12, color: "#0F172A" },
  lockedCountry: { fontWeight: "700", fontSize: 12, color: "#64748B" },
  dateLabel: { marginLeft: "auto", fontSize: 12, color: "#64748B", fontWeight: "600" },
  countryMenu: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  countryItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E2E8F0" },
  countryItemText: { fontWeight: "600", color: "#0F172A" },
  hint: { fontSize: 12, color: "#64748B", lineHeight: 18 },
  realBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#F1F5F9",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  realBadgeText: { fontSize: 10, fontWeight: "800", color: "#64748B", letterSpacing: 0.4 },
  periodRow: { flexDirection: "row", gap: 8 },
  periodChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  periodChipOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  periodText: { fontSize: 12, fontWeight: "800", color: "#0F172A" },
  periodTextOn: { color: "#fff" },
  center: { paddingVertical: 40, alignItems: "center" },
  errorBox: { backgroundColor: "#FEF2F2", padding: 12, borderRadius: 12 },
  errorText: { color: "#B91C1C" },
  retry: { color: colors.flexaGreen, fontWeight: "800", marginTop: 6 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpi: {
    width: "47%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    gap: 8,
  },
  kpiLabel: { fontSize: 11, fontWeight: "800", opacity: 0.7 },
  kpiValue: { fontSize: 24, fontWeight: "900", marginTop: 4 },
  kpiDelta: { marginTop: 6, fontSize: 11, fontWeight: "800", color: "#047857" },
  kpiIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
  },
  cardHead: { flexDirection: "row", gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  muted: { fontSize: 11, color: "#64748B", marginTop: 2 },
  miniPill: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  miniPillText: { fontSize: 10, fontWeight: "700", color: "#64748B" },
  chartRow: { flexDirection: "row", alignItems: "flex-end", height: 120, gap: 4 },
  chartCol: { flex: 1, alignItems: "center", height: "100%" },
  chartBarTrack: { flex: 1, width: "100%", justifyContent: "flex-end" },
  chartBar: { width: "100%", backgroundColor: colors.flexaGreen, borderRadius: 4, minHeight: 4 },
  chartTick: { fontSize: 8, color: "#94A3B8", marginTop: 4 },
  statPills: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  statPill: {
    width: "47%",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
  },
  statPillLabel: { fontSize: 10, fontWeight: "800", color: "#94A3B8" },
  statPillValue: { fontSize: 16, fontWeight: "900", color: "#0F172A", marginTop: 2 },
  breakRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  breakLabel: { fontWeight: "700", color: "#0F172A" },
  breakTrack: { height: 10, borderRadius: 999, backgroundColor: "#E2E8F0", overflow: "hidden" },
  breakFill: { height: "100%", borderRadius: 999 },
  countryRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  pct: { width: 44, textAlign: "right", fontWeight: "800", fontSize: 12 },
  pushCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: 16,
    padding: 14,
  },
  pushIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  pushTitle: { fontWeight: "900", color: "#064E3B" },
  moduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },
  moduleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleTitle: { fontWeight: "800", color: "#0F172A" },
  note: { fontSize: 10, color: "#94A3B8", lineHeight: 14, marginTop: 4 },
});
