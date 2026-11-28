import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
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
import { BeautyShell } from "@/components/beauty/BeautyShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  beautyStatusLabel,
  fetchBeautyCenterAppointments,
  fetchBeautyCenterOverview,
  fetchMyBeautyBusinesses,
  formatBeautyMoney,
  patchBeautyAppointmentStatus,
  updateMyBeautyBusiness,
  type BeautyAppointment,
  type BeautyBusiness,
  type BeautyCenterStats,
} from "@/lib/beautyApi";
import { beautyTheme as T } from "@/lib/beautyTheme";

const LINKS = [
  { path: "/beauty/center-services", titleKey: "beauty_services", bodyKey: "beauty_servicesManage" },
  { path: "/beauty/center-staff", titleKey: "beauty_staff", bodyKey: "beauty_staffManage" },
  { path: "/beauty/center-portfolio", titleKey: "beauty_portfolio", bodyKey: "beauty_portfolioManage" },
  { path: "/beauty/center-calendar", titleKey: "beauty_calendar", bodyKey: "beauty_calendarSubtitle" },
] as const;

export default function BeautyCenterScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ businessId?: string }>();
  const bidParam = Number(params.businessId) || 0;

  const [mine, setMine] = useState<BeautyBusiness[]>([]);
  const [stats, setStats] = useState<BeautyCenterStats | null>(null);
  const [appointments, setAppointments] = useState<BeautyAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const active = mine.find((b) => (bidParam ? b.id === bidParam : true)) ?? mine[0];

  const load = useCallback(async () => {
    setMsg(null);
    try {
      const list = await fetchMyBeautyBusinesses({ token });
      setMine(list);
      const current = list.find((b) => (bidParam ? b.id === bidParam : true)) ?? list[0];
      if (current) {
        const [overview, appts] = await Promise.all([
          fetchBeautyCenterOverview(current.id, { token }),
          fetchBeautyCenterAppointments(current.id, { token }, { limit: 8 }),
        ]);
        setStats(overview.stats);
        setAppointments(appts);
      } else {
        setStats(null);
        setAppointments([]);
      }
    } catch (e: any) {
      setMsg(e?.message || t("beauty_loadError"));
    }
  }, [token, bidParam, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load]),
  );

  async function toggleClosed() {
    if (!active || !token) return;
    try {
      const updated = await updateMyBeautyBusiness(
        active.id,
        { temporarilyClosed: !active.temporarilyClosed },
        { token },
      );
      setMine((prev) => prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)));
    } catch (e: any) {
      setMsg(e?.message || t("beauty_loadError"));
    }
  }

  async function submitForReview() {
    if (!active || !token) return;
    try {
      const updated = await updateMyBeautyBusiness(active.id, { submit: true }, { token });
      setMine((prev) => prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)));
      setMsg(t("beauty_submitted"));
    } catch (e: any) {
      setMsg(e?.message || t("beauty_submitFailed"));
    }
  }

  async function setApptStatus(id: number, status: string) {
    if (!token) return;
    try {
      const updated = await patchBeautyAppointmentStatus(id, status, { token });
      setAppointments((prev) => prev.map((a) => (a.id === id ? updated : a)));
      if (active) {
        const overview = await fetchBeautyCenterOverview(active.id, { token });
        setStats(overview.stats);
      }
    } catch (e: any) {
      setMsg(e?.message || t("beauty_loadError"));
    }
  }

  return (
    <BeautyShell title={t("beauty_centerTitle")} subtitle={t("beauty_centerSubtitle")} scroll={false}>
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
        contentContainerStyle={{ paddingBottom: 28 }}
      >
        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : mine.length === 0 ? (
          <>
            <Text style={styles.text}>{t("beauty_noBusiness")}</Text>
            <Pressable style={styles.btn} onPress={() => router.push("/beauty/onboarding" as any)}>
              <Text style={styles.btnText}>{t("beauty_addBusiness")}</Text>
            </Pressable>
          </>
        ) : !active ? (
          <Text style={styles.text}>{t("beauty_notFound")}</Text>
        ) : (
          <>
            {mine.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {mine.map((b) => {
                  const selected = b.id === active.id;
                  return (
                    <Pressable
                      key={b.id}
                      style={[styles.chip, selected && styles.chipActive, { marginRight: 8 }]}
                      onPress={() => router.setParams({ businessId: String(b.id) } as any)}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{b.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.title}>{active.name}</Text>
              <Text style={styles.muted}>
                {beautyStatusLabel(active.status)}
                {active.temporarilyClosed ? ` · ${t("beauty_closed")}` : ""}
              </Text>
              <View style={styles.actions}>
                <Pressable style={styles.outlineBtn} onPress={() => void toggleClosed()}>
                  <Text style={styles.outlineBtnText}>
                    {active.temporarilyClosed ? t("beauty_markOpen") : t("beauty_markClosed")}
                  </Text>
                </Pressable>
                {["draft", "additional_info_required", "rejected"].includes(active.status) ? (
                  <Pressable style={styles.btn} onPress={() => void submitForReview()}>
                    <Text style={styles.btnText}>{t("beauty_submitReview")}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statVal}>{stats?.todayAppointments ?? 0}</Text>
                <Text style={styles.statLabel}>{t("beauty_today")}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statVal}>{stats?.pendingConfirmation ?? 0}</Text>
                <Text style={styles.statLabel}>{t("beauty_pending")}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statVal}>
                  {formatBeautyMoney(stats?.revenue ?? 0, active.currency || "USD")}
                </Text>
                <Text style={styles.statLabel}>{t("beauty_revenue")}</Text>
              </View>
            </View>

            {LINKS.map((link) => (
              <Pressable
                key={link.path}
                style={styles.linkCard}
                onPress={() =>
                  router.push({ pathname: link.path, params: { businessId: String(active.id) } } as any)
                }
              >
                <Text style={styles.linkTitle}>{t(link.titleKey)}</Text>
                <Text style={styles.muted}>{t(link.bodyKey)}</Text>
              </Pressable>
            ))}

            <Text style={styles.section}>{t("beauty_recentAppointments")}</Text>
            {appointments.length === 0 ? (
              <Text style={styles.muted}>{t("beauty_noAppointments")}</Text>
            ) : (
              appointments.map((a) => (
                <View key={a.id} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.title}>#{a.id}</Text>
                    <Text style={styles.badge}>{beautyStatusLabel(a.status)}</Text>
                  </View>
                  <Text style={styles.muted}>
                    {a.serviceNameSnapshot || "Service"} · {new Date(a.startsAt).toLocaleString()}
                  </Text>
                  {a.status === "pending_confirmation" ? (
                    <View style={styles.actions}>
                      <Pressable style={styles.btn} onPress={() => void setApptStatus(a.id, "confirmed")}>
                        <Text style={styles.btnText}>{t("beauty_confirm")}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.outlineBtn}
                        onPress={() => void setApptStatus(a.id, "cancelled_by_business")}
                      >
                        <Text style={styles.outlineBtnText}>{t("beauty_cancel")}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  {a.status === "confirmed" ? (
                    <Pressable style={styles.outlineBtn} onPress={() => void setApptStatus(a.id, "checked_in")}>
                      <Text style={styles.outlineBtnText}>{t("beauty_checkIn")}</Text>
                    </Pressable>
                  ) : null}
                  {["checked_in", "in_progress"].includes(a.status) ? (
                    <Pressable style={styles.btn} onPress={() => void setApptStatus(a.id, "completed")}>
                      <Text style={styles.btnText}>{t("beauty_complete")}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))
            )}

            {msg ? <Text style={styles.msg}>{msg}</Text> : null}
          </>
        )}
      </ScrollView>
    </BeautyShell>
  );
}

const styles = StyleSheet.create({
  text: { fontWeight: "700", color: T.ink },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontWeight: "800", color: T.ink, fontSize: 15 },
  muted: { color: T.muted, fontSize: 12, marginTop: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  btn: {
    backgroundColor: T.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  btnText: { color: T.white, fontWeight: "800", fontSize: 13 },
  outlineBtn: {
    backgroundColor: T.white,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    alignSelf: "flex-start",
  },
  outlineBtnText: { color: T.ink, fontWeight: "800", fontSize: 13 },
  statsRow: { flexDirection: "row", gap: 8, marginVertical: 8 },
  stat: {
    flex: 1,
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  statVal: { fontWeight: "900", color: T.ink, fontSize: 16 },
  statLabel: { color: T.muted, fontSize: 11, marginTop: 4, fontWeight: "600" },
  linkCard: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  linkTitle: { fontWeight: "800", color: T.ink, fontSize: 15 },
  section: { marginTop: 16, marginBottom: 8, fontWeight: "800", fontSize: 16, color: T.ink },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: {
    color: T.accent,
    fontWeight: "700",
    fontSize: 11,
    textTransform: "capitalize",
    backgroundColor: "rgba(139,69,87,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: T.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  chipActive: { backgroundColor: T.accent, borderColor: T.accent },
  chipText: { color: T.ink, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: T.white },
  msg: { color: T.accent, marginTop: 10, fontWeight: "700" },
});
