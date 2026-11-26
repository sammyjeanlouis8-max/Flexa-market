/**
 * Native Driver Dashboard — matches web DriverDashboard appearance.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  DRIVER_BRAND,
  formatHtg,
  HAITI_COMMUNES_BY_DEPARTMENT,
  HAITI_DEPARTMENTS,
} from "@/lib/haitiCommunes";
import {
  fetchDriverStats,
  fetchDriverZones,
  parseWorkZones,
  patchDriverLocation,
  type DriverStatsResponse,
  type ZonesPayload,
} from "@/lib/driverApi";

type MenuItem = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  href: string;
  badge?: number | null;
};

export default function DriverDashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<DriverStatsResponse | null>(null);
  const [communesByDepartment, setCommunesByDepartment] = useState<Record<string, string[]>>(
    HAITI_COMMUNES_BY_DEPARTMENT,
  );
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [selDepartment, setSelDepartment] = useState("");
  const [selCommunes, setSelCommunes] = useState<string[]>([]);
  const [zoneSaving, setZoneSaving] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const [stats, zones] = await Promise.all([
          fetchDriverStats({ token }),
          fetchDriverZones({ token }).catch((): ZonesPayload => ({})),
        ]);
        setData(stats);
        if (zones.communesByDepartment) {
          setCommunesByDepartment(zones.communesByDepartment);
        } else if (zones.departments && !Array.isArray(zones.departments)) {
          setCommunesByDepartment(zones.departments as Record<string, string[]>);
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load driver dashboard");
      } finally {
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load("initial");
    }, [authLoading, token, router, load]),
  );

  const driver = data?.driver;
  const stats = data?.stats;

  useEffect(() => {
    if (!driver) return;
    setOnline(Boolean(driver.isOnline));
    setSelDepartment(driver.department ?? "");
    const wz = parseWorkZones(driver.workZones);
    setSelCommunes(wz.length ? wz : driver.commune ? [driver.commune] : []);
  }, [driver?.id, driver?.isOnline, driver?.department, driver?.commune, driver?.workZones]);

  const departmentOptions = useMemo(() => {
    const keys = Object.keys(communesByDepartment);
    return (keys.length ? keys : [...HAITI_DEPARTMENTS]).sort((a, b) => a.localeCompare(b, "fr"));
  }, [communesByDepartment]);

  const communeOptions = selDepartment ? communesByDepartment[selDepartment] ?? [] : [];

  async function toggleOnline() {
    if (!token || !driver || driver.status !== "active") {
      Alert.alert("Pa aktif", "Kont chofè ou poko apwouve / aktif.");
      return;
    }
    setToggling(true);
    try {
      const next = !online;
      await patchDriverLocation({ isOnline: next }, { token });
      setOnline(next);
      void load("refresh");
    } catch (e) {
      Alert.alert("Erè", e instanceof Error ? e.message : "Update failed");
    } finally {
      setToggling(false);
    }
  }

  async function saveZone() {
    if (!token || !selDepartment) {
      Alert.alert("Zòn", "Chwazi yon depatman.");
      return;
    }
    setZoneSaving(true);
    try {
      await patchDriverLocation(
        { department: selDepartment, workZones: selCommunes, communes: selCommunes },
        { token },
      );
      Alert.alert("OK", "Zòn travay sove.");
      void load("refresh");
    } catch (e) {
      Alert.alert("Erè", e instanceof Error ? e.message : "Save failed");
    } finally {
      setZoneSaving(false);
    }
  }

  const greetingName = user?.name?.split(" ")[0] || "Driver";
  const avatarSrc = driver?.facePhotoFront || driver?.photoFront || user?.avatarUrl || undefined;
  const deliveriesToday = stats?.deliveriesToday ?? 0;
  const earningsToday = stats?.earningsTodayHtg ?? 0;

  const menuItems: MenuItem[] = [
    {
      key: "available",
      label: "Available Deliveries",
      icon: "package",
      href: "/delivery-tracking",
      badge: stats?.availableCount ?? null,
    },
    {
      key: "mine",
      label: "My Deliveries",
      icon: "truck",
      href: "/delivery-tracking",
      badge: stats?.activeCount ?? null,
    },
    { key: "earnings", label: "My Earnings", icon: "credit-card", href: "/wallet", badge: null },
    { key: "profile", label: "Driver Profile", icon: "user", href: "/edit-profile", badge: null },
  ];

  if (!authLoading && token && data && !driver && !error) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Ou pa yon chofè Flexa Market apwouve.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push("/driver-apply")}>
            <Text style={styles.primaryBtnText}>Apply to become a driver</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, gap: 14 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={DRIVER_BRAND.primary} />
        }
      >
        <View style={styles.brandStrip}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Feather name="arrow-left" size={20} color="#0F172A" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandTitle}>Flexa Market</Text>
            <View style={styles.driverBadge}>
              <Text style={styles.driverBadgeText}>Driver</Text>
            </View>
          </View>
          <Pressable onPress={() => void load("refresh")} style={styles.iconBtn}>
            <Feather name="refresh-cw" size={18} color="#0F172A" />
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!data && !error ? (
          <ActivityIndicator color={DRIVER_BRAND.primary} style={{ marginTop: 40 }} />
        ) : null}

        {driver ? (
          <>
            <View style={styles.profileCard}>
              {avatarSrc ? (
                <Image source={{ uri: avatarSrc }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>{greetingName.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.greeting}>Good work, {greetingName}!</Text>
                <Text style={styles.onlineHint}>
                  {online
                    ? "You are available for delivery"
                    : "You are offline — new jobs are hidden"}
                </Text>
              </View>
              <Pressable
                onPress={() => void toggleOnline()}
                disabled={toggling}
                style={[styles.toggle, { backgroundColor: online ? DRIVER_BRAND.success : "#E2E8F0" }]}
                accessibilityRole="switch"
                accessibilityState={{ checked: online }}
              >
                <View style={[styles.toggleKnob, { left: online ? 28 : 4 }]}>
                  {toggling ? (
                    <ActivityIndicator size="small" color="#64748B" />
                  ) : (
                    <Feather name="power" size={12} color="#64748B" />
                  )}
                </View>
              </Pressable>
            </View>

            <View style={styles.statsRow}>
              <View style={[styles.statSoft, { backgroundColor: DRIVER_BRAND.soft, borderColor: DRIVER_BRAND.softBorder }]}>
                <Feather name="truck" size={20} color={DRIVER_BRAND.success} />
                <Text style={styles.statBig}>{deliveriesToday}</Text>
                <Text style={styles.statCap}>Deliveries today</Text>
              </View>
              <View style={styles.statCard}>
                <Feather name="credit-card" size={20} color={DRIVER_BRAND.success} />
                <Text style={styles.statMoney}>{formatHtg(earningsToday)}</Text>
                <Text style={styles.statCap}>Earnings today</Text>
              </View>
            </View>

            <View style={styles.zoneCard}>
              <Text style={styles.zoneTitle}>Choose your work zone</Text>
              <Text style={styles.fieldLabel}>DEPARTMENT</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {departmentOptions.map((dep) => {
                    const active = selDepartment === dep;
                    return (
                      <Pressable
                        key={dep}
                        onPress={() => {
                          setSelDepartment(dep);
                          setSelCommunes([]);
                        }}
                        style={[
                          styles.chip,
                          active && { backgroundColor: DRIVER_BRAND.primary, borderColor: DRIVER_BRAND.primary },
                        ]}
                      >
                        <Text style={[styles.chipText, active && { color: "#fff" }]}>{dep}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {selDepartment ? (
                <>
                  <Text style={styles.fieldLabel}>COMMUNES (select one or more)</Text>
                  <View style={styles.communeWrap}>
                    {communeOptions.map((c) => {
                      const active = selCommunes.includes(c);
                      return (
                        <Pressable
                          key={c}
                          onPress={() =>
                            setSelCommunes((prev) =>
                              prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                            )
                          }
                          style={[
                            styles.chip,
                            active && { backgroundColor: DRIVER_BRAND.primary, borderColor: DRIVER_BRAND.primary },
                          ]}
                        >
                          <Text style={[styles.chipText, active && { color: "#fff" }]}>{c}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <Pressable
                style={[styles.primaryBtn, (!selDepartment || zoneSaving) && { opacity: 0.6 }]}
                disabled={!selDepartment || zoneSaving}
                onPress={() => void saveZone()}
              >
                {zoneSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name="check-circle" size={16} color="#fff" />
                    <Text style={styles.primaryBtnText}>Set work zone</Text>
                  </>
                )}
              </Pressable>
            </View>

            <View style={styles.menuCard}>
              {menuItems.map((item, idx) => (
                <Pressable
                  key={item.key}
                  style={[styles.menuRow, idx < menuItems.length - 1 && styles.menuBorder]}
                  onPress={() => router.push(item.href as any)}
                >
                  <View style={styles.menuIcon}>
                    <Feather name={item.icon} size={18} color={DRIVER_BRAND.success} />
                  </View>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  {item.badge != null && item.badge > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.badge}</Text>
                    </View>
                  ) : null}
                  <Feather name="chevron-right" size={18} color="#94A3B8" />
                </Pressable>
              ))}
            </View>

            <View style={styles.earningsCard}>
              <Text style={styles.zoneTitle}>Earnings overview</Text>
              <View style={styles.earnRow}>
                {[
                  { label: "Today", value: stats?.earningsTodayHtg },
                  { label: "Week", value: stats?.earningsWeekHtg },
                  { label: "Month", value: stats?.earningsMonthHtg },
                ].map((e) => (
                  <View key={e.label} style={styles.earnCell}>
                    <Text style={styles.earnLabel}>{e.label}</Text>
                    <Text style={styles.earnValue}>{formatHtg(e.value)}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.earnNote}>
                HTG amounts use the live exchange rate for display. Wallet credits remain on the
                existing payout rules.
              </Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
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
  brandStrip: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandTitle: { fontSize: 15, fontWeight: "900", color: "#0F172A" },
  driverBadge: {
    alignSelf: "flex-start",
    marginTop: 2,
    backgroundColor: DRIVER_BRAND.orange,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  driverBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
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
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: DRIVER_BRAND.softBorder },
  avatarFallback: {
    backgroundColor: DRIVER_BRAND.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontSize: 20, fontWeight: "900", color: DRIVER_BRAND.success },
  greeting: { fontSize: 16, fontWeight: "900", color: "#0F172A" },
  onlineHint: { fontSize: 12, color: "#64748B", marginTop: 2 },
  toggle: { width: 56, height: 32, borderRadius: 999, position: "relative" },
  toggleKnob: {
    position: "absolute",
    top: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  statsRow: { flexDirection: "row", gap: 10 },
  statSoft: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 14, gap: 4 },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    padding: 14,
    gap: 4,
  },
  statBig: { fontSize: 28, fontWeight: "900", color: "#0F172A" },
  statMoney: { fontSize: 18, fontWeight: "900", color: "#0F172A" },
  statCap: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  zoneCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 8,
  },
  zoneTitle: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  chipText: { fontSize: 12, fontWeight: "800", color: "#0F172A" },
  communeWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, maxHeight: 160 },
  primaryBtn: {
    marginTop: 6,
    height: 44,
    borderRadius: 12,
    backgroundColor: DRIVER_BRAND.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  menuCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  menuBorder: { borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: DRIVER_BRAND.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: "800", color: "#0F172A" },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  earningsCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 10,
  },
  earnRow: { flexDirection: "row", gap: 8 },
  earnCell: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
  },
  earnLabel: { fontSize: 10, fontWeight: "800", color: "#64748B", textTransform: "uppercase" },
  earnValue: { fontSize: 13, fontWeight: "900", color: "#0F172A", marginTop: 4 },
  earnNote: { fontSize: 11, color: "#64748B", lineHeight: 16 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: "800", textAlign: "center", color: "#0F172A" },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: "#B91C1C", fontSize: 14 },
});
