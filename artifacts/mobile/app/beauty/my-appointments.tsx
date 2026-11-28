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
import { BeautyShell } from "@/components/beauty/BeautyShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  beautyStatusLabel,
  cancelBeautyAppointment,
  fetchMyBeautyAppointments,
  formatBeautyMoney,
  type BeautyAppointment,
} from "@/lib/beautyApi";
import { beautyTheme as T } from "@/lib/beautyTheme";

export default function BeautyMyAppointmentsScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<BeautyAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchMyBeautyAppointments({ token }));
    } catch (e: any) {
      setError(e?.message || t("beauty_loadError"));
      setRows([]);
    }
  }, [token, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load]),
  );

  async function cancel(id: number) {
    try {
      const updated = await cancelBeautyAppointment(id, { token: token! });
      setRows((prev) => prev.map((a) => (a.id === id ? updated : a)));
    } catch (e: any) {
      setError(e?.message || t("beauty_cancelFailed"));
    }
  }

  const canCancel = (status: string) =>
    ["pending_confirmation", "confirmed", "rescheduled"].includes(status);

  return (
    <BeautyShell title={t("beauty_myAppointmentsTitle")} subtitle={t("beauty_myAppointmentsSubtitle")} scroll={false}>
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
      >
        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.err}>{error}</Text>
        ) : rows.length === 0 ? (
          <>
            <Text style={styles.text}>{t("beauty_noAppointments")}</Text>
            <Pressable style={styles.btn} onPress={() => router.push("/beauty/discover" as any)}>
              <Text style={styles.btnText}>{t("beauty_tabDiscover")}</Text>
            </Pressable>
          </>
        ) : (
          rows.map((a) => (
            <View key={a.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.title}>#{a.id}</Text>
                <Text style={styles.badge}>{beautyStatusLabel(a.status)}</Text>
              </View>
              <Text style={styles.svc}>{a.serviceNameSnapshot || t("beauty_services")}</Text>
              <Text style={styles.muted}>
                {new Date(a.startsAt).toLocaleString()} · {formatBeautyMoney(a.total, a.currency)}
              </Text>
              {a.paymentStatus ? (
                <Text style={styles.muted}>{beautyStatusLabel(a.paymentStatus)}</Text>
              ) : null}
              {canCancel(a.status) ? (
                <Pressable style={styles.cancel} onPress={() => void cancel(a.id)}>
                  <Text style={styles.cancelText}>{t("beauty_cancel")}</Text>
                </Pressable>
              ) : null}
            </View>
          ))
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
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontWeight: "800", color: T.ink, fontSize: 15 },
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
  svc: { fontWeight: "700", color: T.ink, marginTop: 8, fontSize: 14 },
  muted: { color: T.muted, fontSize: 12, marginTop: 4 },
  cancel: { marginTop: 10, alignSelf: "flex-start", paddingVertical: 8 },
  cancelText: { color: "#b91c1c", fontWeight: "800", fontSize: 13 },
  btn: {
    marginTop: 14,
    alignSelf: "flex-start",
    backgroundColor: T.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnText: { color: T.white, fontWeight: "800" },
  err: { color: "#b91c1c", marginTop: 12 },
});
