/**
 * Native driver job detail — status progression + PIN verify (matches web DriverJobDetail).
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { friendlyApiError, tr } from "@/i18n/nativeScreens";
import { DRIVER_BRAND, formatHtg } from "@/lib/haitiCommunes";
import {
  cancelDriverDelivery,
  DRIVER_NEXT_STATUS,
  fetchDriverJobView,
  patchDeliveryStatus,
  verifyDeliveryCode,
  type DriverJobDetail,
} from "@/lib/driverApi";

function mapsUrl(address: string | null, city: string | null): string {
  const dest = encodeURIComponent([address, city].filter(Boolean).join(", ") || "");
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

export default function DriverJobScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id: idParam } = useLocalSearchParams<{ id?: string }>();
  const deliveryId = Number(idParam);
  const { token, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();

  const [job, setJob] = useState<DriverJobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token || !Number.isFinite(deliveryId)) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const detail = await fetchDriverJobView(deliveryId, { token });
        setJob(detail);
        setError(null);
      } catch (e) {
        setError(
          friendlyApiError(e instanceof Error ? e.message : undefined, t) || t("driver_job_loadError"),
        );
      } finally {
        setRefreshing(false);
      }
    },
    [token, deliveryId, t],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && Number.isFinite(deliveryId)) void load("initial");
    }, [authLoading, token, router, load, deliveryId]),
  );

  const nextStatus = job ? DRIVER_NEXT_STATUS[job.status] : undefined;

  const nextLabel = useMemo(() => {
    if (!job) return null;
    if (job.status === "driver_assigned") return t("driver_job_start");
    if (job.status === "arrived_pickup") return t("driver_job_confirmPickup");
    if (job.status === "picked_up") return t("driver_job_onTheWay");
    if (job.status === "on_the_way") return t("driver_job_arrivedCustomer");
    return null;
  }, [job, t]);

  const feeHtg =
    job?.driverEarningsHtg ??
    (job?.feeLocal != null ? Math.round(job.feeLocal * 0.8) : null);

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      driver_assigned: t("driver_job_statusAccepted"),
      arrived_pickup: t("driver_job_statusArrivedPickup"),
      picked_up: t("driver_job_statusPickedUp"),
      on_the_way: t("driver_job_statusOnTheWay"),
      arrived: t("driver_job_statusArrived"),
      delivered: t("driver_job_statusDelivered"),
    };
    return map[status] || status;
  };

  async function advance() {
    if (!token || !job || !nextStatus) return;
    setBusy(true);
    try {
      await patchDeliveryStatus(job.id, nextStatus, { token });
      await load("refresh");
    } catch (e) {
      Alert.alert(t("common_error"), friendlyApiError(e instanceof Error ? e.message : undefined, t));
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyPin() {
    if (!token || !job || pin.trim().length < 4) return;
    setBusy(true);
    try {
      await verifyDeliveryCode(job.id, pin.trim(), { token });
      Alert.alert(t("common_ok"), t("driver_job_deliveredOk"));
      router.replace("/driver-dashboard");
    } catch (e) {
      Alert.alert(t("common_error"), friendlyApiError(e instanceof Error ? e.message : undefined, t));
    } finally {
      setBusy(false);
    }
  }

  function onCancel() {
    if (!token || !job) return;
    Alert.alert(t("driver_job_cancelTitle"), t("driver_job_cancelBody"), [
      { text: t("common_ok"), style: "cancel" },
      {
        text: t("driver_job_cancel"),
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await cancelDriverDelivery(job.id, { token });
            router.replace("/driver-dashboard");
          } catch (e) {
            Alert.alert(
              t("common_error"),
              friendlyApiError(e instanceof Error ? e.message : undefined, t),
            );
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  if (!Number.isFinite(deliveryId)) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.errorText}>{t("driver_job_loadError")}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]} testID="driver-job-detail">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel={t("driver_job_back")}>
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </Pressable>
        <Text style={styles.topTitle}>{t("driver_job_title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 36, gap: 14, paddingHorizontal: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load("refresh")}
            tintColor={DRIVER_BRAND.primary}
          />
        }
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.primaryBtn} onPress={() => void load("initial")}>
              <Text style={styles.primaryBtnText}>{t("common_retry")}</Text>
            </Pressable>
          </View>
        ) : null}

        {!job && !error ? (
          <ActivityIndicator color={DRIVER_BRAND.primary} style={{ marginTop: 48 }} />
        ) : null}

        {job ? (
          <>
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.orderRef}>{job.orderRef}</Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>{statusLabel(job.status)}</Text>
                </View>
              </View>
              <View style={styles.listingRow}>
                {job.listingImage ? (
                  <Image source={{ uri: job.listingImage }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Feather name="package" size={22} color="#94A3B8" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.listingTitle} numberOfLines={2}>
                    {job.listingTitle || t("driver_job_package")}
                  </Text>
                  {job.orderAmount != null ? (
                    <Text style={styles.muted}>${Number(job.orderAmount).toFixed(2)}</Text>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.routeRow}>
                <View style={styles.routeRail}>
                  <View style={[styles.dot, { backgroundColor: DRIVER_BRAND.success }]}>
                    <Feather name="package" size={12} color="#fff" />
                  </View>
                  <View style={styles.railLine} />
                  <View style={[styles.dot, { backgroundColor: "#EF4444" }]}>
                    <Feather name="map-pin" size={12} color="#fff" />
                  </View>
                </View>
                <View style={{ flex: 1, gap: 16 }}>
                  <View>
                    <Text style={styles.fieldCap}>{t("driver_job_pickup")}</Text>
                    <Text style={styles.place}>{job.pickupCity || "—"}</Text>
                    {job.pickupAddress ? (
                      <Text style={styles.muted} numberOfLines={2}>
                        {job.pickupAddress}
                      </Text>
                    ) : null}
                  </View>
                  <View>
                    <Text style={styles.fieldCap}>{t("driver_job_dropoff")}</Text>
                    <Text style={styles.place}>{job.deliveryCity || "—"}</Text>
                    {job.deliveryAddress ? (
                      <Text style={styles.muted} numberOfLines={2}>
                        {job.deliveryAddress}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
              {job.distanceKm != null ? (
                <Text style={styles.distance}>
                  {tr(t, "driver_job_distance", { km: job.distanceKm.toFixed(1) })}
                </Text>
              ) : null}
            </View>

            <View style={[styles.feeCard, { backgroundColor: DRIVER_BRAND.soft, borderColor: DRIVER_BRAND.softBorder }]}>
              <Text style={styles.feeLabel}>{t("driver_job_feeForYou")}</Text>
              <Text style={[styles.feeValue, { color: DRIVER_BRAND.success }]}>{formatHtg(feeHtg)}</Text>
            </View>

            {job.pinRequired ? (
              <View style={[styles.hintCard, { backgroundColor: DRIVER_BRAND.soft }]}>
                <Feather name="lock" size={16} color={DRIVER_BRAND.success} />
                <Text style={styles.hintText}>{t("driver_job_pinHint")}</Text>
              </View>
            ) : null}

            {job.sellerNote ? (
              <View style={styles.card}>
                <Text style={styles.fieldCap}>{t("driver_job_instructions")}</Text>
                <Text style={styles.noteBody}>{job.sellerNote}</Text>
              </View>
            ) : null}

            <View style={styles.actionGrid}>
              <Pressable
                style={styles.outlineBtn}
                onPress={() => {
                  if (job.buyerPhone) void Linking.openURL(`tel:${job.buyerPhone}`);
                }}
                disabled={!job.buyerPhone}
              >
                <Feather name="phone" size={16} color={DRIVER_BRAND.success} />
                <Text style={[styles.outlineBtnText, { color: DRIVER_BRAND.success }]}>
                  {t("driver_job_callCustomer")}
                </Text>
              </Pressable>
              <Pressable
                style={styles.outlineBtn}
                onPress={() => void Linking.openURL(mapsUrl(job.pickupAddress, job.pickupCity))}
              >
                <Feather name="navigation" size={16} color={DRIVER_BRAND.success} />
                <Text style={[styles.outlineBtnText, { color: DRIVER_BRAND.success }]}>
                  {t("driver_job_navPickup")}
                </Text>
              </Pressable>
              <Pressable
                style={styles.outlineBtn}
                onPress={() => void Linking.openURL(mapsUrl(job.deliveryAddress, job.deliveryCity))}
              >
                <Feather name="map" size={16} color={DRIVER_BRAND.success} />
                <Text style={[styles.outlineBtnText, { color: DRIVER_BRAND.success }]}>
                  {t("driver_job_navDropoff")}
                </Text>
              </Pressable>
              {job.sellerPhone ? (
                <Pressable
                  style={styles.outlineBtn}
                  onPress={() => void Linking.openURL(`tel:${job.sellerPhone}`)}
                >
                  <Feather name="phone-call" size={16} color={DRIVER_BRAND.success} />
                  <Text style={[styles.outlineBtnText, { color: DRIVER_BRAND.success }]}>
                    {t("driver_job_contactSeller")}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {nextStatus && nextLabel ? (
              <Pressable
                style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
                disabled={busy}
                onPress={() => void advance()}
                testID="advance-delivery"
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name="truck" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>{nextLabel}</Text>
                  </>
                )}
              </Pressable>
            ) : null}

            {job.status === "arrived" ? (
              <View style={styles.card}>
                <Text style={styles.pinTitle}>{t("driver_job_enterPin")}</Text>
                <TextInput
                  value={pin}
                  onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 8))}
                  keyboardType="number-pad"
                  placeholder="••••••"
                  placeholderTextColor="#94A3B8"
                  style={styles.pinInput}
                  maxLength={8}
                  testID="delivery-pin-input"
                />
                <Pressable
                  style={[styles.primaryBtn, (busy || pin.length < 4) && { opacity: 0.5 }]}
                  disabled={busy || pin.length < 4}
                  onPress={() => void onVerifyPin()}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>{t("driver_job_confirmWithPin")}</Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            {job.status !== "delivered" ? (
              <Pressable
                style={[styles.dangerBtn, busy && { opacity: 0.6 }]}
                disabled={busy}
                onPress={onCancel}
              >
                <Feather name="x-circle" size={16} color={DRIVER_BRAND.danger} />
                <Text style={[styles.dangerBtnText, { color: DRIVER_BRAND.danger }]}>
                  {t("driver_job_cancel")}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
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
  topTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 12,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  orderRef: { fontFamily: "monospace", fontSize: 13, fontWeight: "800", color: "#0F172A" },
  statusPill: {
    backgroundColor: "#DBEAFE",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: { fontSize: 11, fontWeight: "800", color: "#1D4ED8" },
  listingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: "#F1F5F9" },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  listingTitle: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  muted: { fontSize: 12, color: "#64748B", marginTop: 2 },
  routeRow: { flexDirection: "row", gap: 12 },
  routeRail: { alignItems: "center", width: 28 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  railLine: { width: 2, flex: 1, minHeight: 28, backgroundColor: "#E2E8F0", marginVertical: 4 },
  fieldCap: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  place: { fontSize: 14, fontWeight: "800", color: "#0F172A", marginTop: 2 },
  distance: { fontSize: 12, color: "#64748B", marginTop: 4 },
  feeCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  feeLabel: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  feeValue: { fontSize: 18, fontWeight: "900" },
  hintCard: {
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  hintText: { flex: 1, fontSize: 13, color: "#334155", lineHeight: 18, fontWeight: "600" },
  noteBody: { fontSize: 13, color: "#334155", lineHeight: 18 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  outlineBtn: {
    flexGrow: 1,
    minWidth: "46%",
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: DRIVER_BRAND.success,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 8,
  },
  outlineBtnText: { fontSize: 12, fontWeight: "800" },
  primaryBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: DRIVER_BRAND.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  pinTitle: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  pinInput: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    textAlign: "center",
    fontSize: 22,
    letterSpacing: 8,
    fontWeight: "700",
    color: "#0F172A",
  },
  dangerBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: DRIVER_BRAND.danger,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#fff",
  },
  dangerBtnText: { fontSize: 14, fontWeight: "800" },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: { color: "#B91C1C", fontWeight: "700", textAlign: "center" },
});
