import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
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
import { BeautyShell } from "@/components/beauty/BeautyShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  beautyStatusLabel,
  fetchBeautyCenterCalendar,
  type BeautyAppointment,
} from "@/lib/beautyApi";
import { beautyTheme as T } from "@/lib/beautyTheme";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export default function BeautyCenterCalendarScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ businessId?: string }>();
  const businessId = Number(params.businessId);

  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [appointments, setAppointments] = useState<BeautyAppointment[]>([]);
  const [blocks, setBlocks] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const from = startOfDay(anchor);
    const to = endOfDay(addDays(anchor, 6));
    return { from, to };
  }, [anchor]);

  const load = useCallback(async () => {
    if (!Number.isFinite(businessId) || businessId <= 0) {
      setError(t("beauty_notFound"));
      return;
    }
    setError(null);
    const data = await fetchBeautyCenterCalendar(
      businessId,
      range.from.toISOString(),
      range.to.toISOString(),
      { token },
    );
    setAppointments(data.appointments || []);
    setBlocks(data.blocks || []);
  }, [businessId, range.from, range.to, token, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load()
        .catch((e: Error) => setError(e.message || t("beauty_loadError")))
        .finally(() => setLoading(false));
    }, [load, t]),
  );

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)), [anchor]);

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return (
      <BeautyShell title={t("beauty_calendar")} scroll>
        <Text style={styles.muted}>{t("beauty_notFound")}</Text>
        <Pressable style={styles.btn} onPress={() => router.push("/beauty/center" as any)}>
          <Text style={styles.btnText}>{t("beauty_tabCenter")}</Text>
        </Pressable>
      </BeautyShell>
    );
  }

  return (
    <BeautyShell title={t("beauty_calendar")} subtitle={t("beauty_calendarSubtitle")} scroll={false}>
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
        contentContainerStyle={{ paddingBottom: 28 }}
      >
        <View style={styles.nav}>
          <Pressable style={styles.outlineBtn} onPress={() => setAnchor((d) => addDays(d, -7))}>
            <Text style={styles.outlineBtnText}>←</Text>
          </Pressable>
          <Text style={styles.rangeLabel}>
            {range.from.toLocaleDateString()} – {range.to.toLocaleDateString()}
          </Text>
          <Pressable style={styles.outlineBtn} onPress={() => setAnchor((d) => addDays(d, 7))}>
            <Text style={styles.outlineBtnText}>→</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.err}>{error}</Text>
        ) : (
          days.map((day) => {
            const dayStart = startOfDay(day).getTime();
            const dayEnd = endOfDay(day).getTime();
            const dayAppts = appointments.filter((a) => {
              const ts = new Date(a.startsAt).getTime();
              return ts >= dayStart && ts <= dayEnd;
            });
            return (
              <View key={day.toISOString()} style={styles.dayCard}>
                <Text style={styles.dayTitle}>
                  {day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </Text>
                {dayAppts.length === 0 ? (
                  <Text style={styles.muted}>{t("beauty_noAppointments")}</Text>
                ) : (
                  dayAppts.map((a) => (
                    <View key={a.id} style={styles.appt}>
                      <Text style={styles.apptTitle}>
                        {new Date(a.startsAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {a.serviceNameSnapshot || `#${a.id}`}
                      </Text>
                      <Text style={styles.muted}>
                        {beautyStatusLabel(a.status)}
                        {a.customerName ? ` · ${a.customerName}` : ""}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            );
          })
        )}

        {blocks.length > 0 ? (
          <Text style={styles.muted}>
            {t("beauty_blocksCount").replace("{{count}}", String(blocks.length))}
          </Text>
        ) : null}
      </ScrollView>
    </BeautyShell>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },
  rangeLabel: { flex: 1, textAlign: "center", fontWeight: "800", color: T.ink, fontSize: 13 },
  outlineBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    backgroundColor: T.white,
  },
  outlineBtnText: { color: T.ink, fontWeight: "800" },
  dayCard: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  dayTitle: { fontWeight: "800", color: T.ink, marginBottom: 8 },
  appt: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.line,
  },
  apptTitle: { fontWeight: "700", color: T.ink, fontSize: 14 },
  muted: { color: T.muted, fontSize: 12, marginTop: 2 },
  btn: {
    marginTop: 12,
    backgroundColor: T.accent,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  btnText: { color: T.white, fontWeight: "800" },
  err: { color: "#b91c1c", marginTop: 12 },
});
