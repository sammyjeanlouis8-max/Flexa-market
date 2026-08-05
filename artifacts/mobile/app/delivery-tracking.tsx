/**
 * Native delivery tracking screen — UPS-level professional experience.
 * Polls every 10 seconds for live status updates.
 * Replaces the old SafeWebView wrapper.
 */
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Linking,
  ActivityIndicator, StyleSheet, RefreshControl, Animated,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { getBaseUrl } from "@/hooks/useApi";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Delivery {
  id: number;
  trackingNumber: string | null;
  status: string;
  deliveryCity: string | null;
  pickupCity: string | null;
  deliveryAddress: string | null;
  country: string;
  verificationCode: string | null;
  totalAmount: number | null;
  currency: string;
  feeUsd: number | null;
  createdAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  arrivedAt: string | null;
  buyerId: number;
  sellerId: number;
  driverUserId: number | null;
  holdAmountUsd: number | null;
  returnCode: string | null;
  returnFeeUsd: number | null;
  buyerAbsentAt: string | null;
}

interface Driver {
  name: string;
  avatar: string | null;
  phone: string | null;
  rating: number | null;
  deliveryCount: number | null;
  vehicleType: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  licensePlateNumber: string | null;
  facePhotoFront: string | null;
  latitude: number | null;
  longitude: number | null;
}

// ── Step config ───────────────────────────────────────────────────────────────
const STEPS = [
  { key: "waiting",         label: "Kòmand Reçu",  icon: "cube-outline"         as const },
  { key: "driver_assigned", label: "Chofè Trovè",  icon: "person-outline"       as const },
  { key: "arrived_pickup",  label: "Kote Machann", icon: "location-outline"     as const },
  { key: "picked_up",       label: "Ranmase",       icon: "bag-check-outline"    as const },
  { key: "on_the_way",      label: "Sou Wout",      icon: "bicycle-outline"      as const },
  { key: "arrived",         label: "Rive!",          icon: "pin-outline"          as const },
  { key: "delivered",       label: "Livre ✓",       icon: "checkmark-circle"     as const },
];

const STATUS_COLORS: Record<string, string> = {
  waiting:         "#f97316",
  driver_assigned: "#22c55e",
  arrived_pickup:  "#22c55e",
  picked_up:       "#3b82f6",
  on_the_way:      "#3b82f6",
  arrived:         "#22c55e",
  delivered:       "#10b981",
  failed_pickup:   "#ef4444",
  returning:       "#8b5cf6",
  returned:        "#64748b",
};

const STATUS_LABELS: Record<string, string> = {
  waiting:         "Ap Chèche Chofè...",
  driver_assigned: "Chofè Asiyé ✓",
  arrived_pickup:  "Kote Machann",
  picked_up:       "Kolis Ranmase",
  on_the_way:      "Sou Wout Ba Ou",
  arrived:         "Chofè Rive!",
  delivered:       "Livre Avèk Siksè ✓",
  failed_pickup:   "Echek Ranmase",
  returning:       "Ap Retounen",
  returned:        "Retounen ✓",
  buyer_absent:    "Ou Pa T La",
};

// ── Route Progress Bar ────────────────────────────────────────────────────────
function ProgressRoute({ status, isMoto }: { status: string; isMoto: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const stepIdx = Math.max(0, STEPS.findIndex(s => s.key === status));
  const targetProgress = stepIdx / (STEPS.length - 1);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: targetProgress,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [status]);

  const widthInterpolate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const isDelivered = status === "delivered";
  const isActive = !["waiting", "delivered", "failed_pickup"].includes(status);
  const statusColor = STATUS_COLORS[status] ?? "#22c55e";

  return (
    <View style={styles.mapContainer}>
      {/* Dark map background */}
      <View style={styles.mapBg}>
        {/* Grid lines */}
        {[25, 50, 75].map(p => (
          <View key={p} style={[styles.gridLineV, { left: `${p}%` as any }]} />
        ))}
        {[33, 66].map(p => (
          <View key={p} style={[styles.gridLineH, { top: `${p}%` as any }]} />
        ))}

        {/* Route track */}
        <View style={styles.routeTrack}>
          <Animated.View
            style={[styles.routeProgress, {
              width: widthInterpolate,
              backgroundColor: isDelivered ? "#10b981" : statusColor,
            }]}
          />
        </View>

        {/* Origin dot */}
        <View style={[styles.originDot, { borderColor: "#f97316" }]}>
          <View style={[styles.originInner, { backgroundColor: "#f97316" }]} />
        </View>

        {/* Destination pin */}
        <View style={styles.destPin}>
          <Ionicons name="location" size={24} color="#22c55e" />
        </View>

        {/* Moving vehicle */}
        {!isDelivered && (
          <Animated.View style={[styles.vehicle, { left: widthInterpolate }]}>
            <View style={[styles.vehicleCircle, { borderColor: statusColor }]}>
              <Text style={{ fontSize: 18 }}>{isMoto ? "🏍️" : "🚗"}</Text>
            </View>
            {isActive && (
              <View style={[styles.vehiclePing, { backgroundColor: statusColor }]} />
            )}
          </Animated.View>
        )}

        {/* Delivered overlay */}
        {isDelivered && (
          <View style={styles.deliveredOverlay}>
            <Ionicons name="checkmark-circle" size={48} color="#10b981" />
            <Text style={styles.deliveredLabel}>LIVRE ✓</Text>
          </View>
        )}

        {/* FM Live badge */}
        <View style={styles.liveBadge}>
          <View style={[styles.liveDot, { backgroundColor: isActive ? "#22c55e" : "#64748b" }]} />
          <Text style={styles.liveBadgeText}>{isActive ? "FM LIVE" : "FM TRACK"}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Step Timeline ─────────────────────────────────────────────────────────────
function StepTimeline({ status }: { status: string }) {
  const currentIdx = STEPS.findIndex(s => s.key === status);

  return (
    <View style={styles.timelineContainer}>
      {STEPS.map((step, i) => {
        const done = i <= currentIdx;
        const active = i === currentIdx;
        const color = active ? (STATUS_COLORS[status] ?? "#22c55e") : done ? "#22c55e" : "#374151";

        return (
          <View key={step.key} style={styles.timelineStep}>
            <View style={styles.timelineIconCol}>
              <View style={[
                styles.stepIcon,
                active && { backgroundColor: color, borderColor: color, shadowColor: color, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 },
                done && !active && { borderColor: "#22c55e" },
                !done && { borderColor: "#374151" },
              ]}>
                <Ionicons
                  name={step.icon}
                  size={14}
                  color={active ? "#fff" : done ? "#22c55e" : "#374151"}
                />
              </View>
              {i < STEPS.length - 1 && (
                <View style={[styles.stepConnector, { backgroundColor: i < currentIdx ? "#22c55e40" : "#1f2937" }]} />
              )}
            </View>
            <View style={styles.stepLabelCol}>
              <Text style={[styles.stepLabel, { color: active ? color : done ? "#d1d5db" : "#4b5563" }]}>
                {step.label}
                {active && "  ●"}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Driver Card ───────────────────────────────────────────────────────────────
function DriverCard({ driver, isMoto }: { driver: Driver; isMoto: boolean }) {
  const vehicleName = [driver.vehicleBrand, driver.vehicleModel].filter(Boolean).join(" ") || null;

  const callDriver = () => {
    if (driver.phone) Linking.openURL(`tel:${driver.phone}`);
  };
  const messageDriver = () => {
    if (driver.phone) Linking.openURL(`https://wa.me/${driver.phone.replace(/[^\d]/g, "")}`);
  };

  return (
    <View style={styles.driverCard}>
      {/* Photo + Info row */}
      <View style={styles.driverRow}>
        <View style={styles.driverAvatarWrapper}>
          {driver.facePhotoFront || driver.avatar ? (
            <Image
              source={{ uri: driver.facePhotoFront ?? driver.avatar! }}
              style={styles.driverAvatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.driverAvatar, { backgroundColor: "#1e3a5f", alignItems: "center", justifyContent: "center" }]}>
              <Text style={{ fontSize: 28, fontWeight: "900", color: "#f97316" }}>
                {driver.name?.[0]?.toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.onlineDot} />
          <View style={styles.fmBadge}>
            <Text style={styles.fmBadgeText}>FM</Text>
          </View>
        </View>

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.driverName}>{driver.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
            <Ionicons name="shield-checkmark" size={14} color="#22c55e" />
            <Text style={{ fontSize: 12, color: "#22c55e", fontWeight: "600" }}>FM Verified</Text>
          </View>
          {driver.rating != null && driver.rating > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: "900", color: "#f1f5f9" }}>{driver.rating.toFixed(1)}</Text>
              <Ionicons name="star" size={14} color="#fbbf24" />
              <View style={[styles.vehicleBadge, { backgroundColor: isMoto ? "#1e3a5f" : "#1e3a5f" }]}>
                <Ionicons name={isMoto ? "bicycle" : "car"} size={11} color="#60a5fa" />
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#60a5fa", marginLeft: 3 }}>
                  {isMoto ? "Moto" : "Machin"}
                </Text>
              </View>
            </View>
          )}
          {vehicleName && (
            <Text style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{vehicleName}</Text>
          )}
          {driver.vehicleColor && (
            <Text style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>{driver.vehicleColor}</Text>
          )}
        </View>

        {/* License plate */}
        {driver.licensePlateNumber && (
          <View style={styles.plateContainer}>
            <View style={styles.plateStripe} />
            <Text style={styles.plateText}>{driver.licensePlateNumber}</Text>
            <View style={styles.plateStripe} />
          </View>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, !driver.phone && { opacity: 0.4 }]}
          onPress={callDriver}
          disabled={!driver.phone}
        >
          <Ionicons name="call" size={20} color="#22c55e" />
          <Text style={styles.actionBtnLabel}>Rele</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, !driver.phone && { opacity: 0.4 }]}
          onPress={messageDriver}
          disabled={!driver.phone}
        >
          <Ionicons name="logo-whatsapp" size={20} color="#22c55e" />
          <Text style={styles.actionBtnLabel}>WhatsApp</Text>
        </TouchableOpacity>
        {driver.latitude != null && driver.longitude != null && (
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: "#22c55e30", backgroundColor: "#022c1a" }]}
            onPress={() => Linking.openURL(`https://www.google.com/maps?q=${driver.latitude},${driver.longitude}`)}
          >
            <Ionicons name="navigate" size={20} color="#22c55e" />
            <Text style={[styles.actionBtnLabel, { color: "#22c55e" }]}>GPS Live</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function DeliveryTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, user } = useAuth();
  const router = useRouter();

  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const r = await fetch(`${getBaseUrl()}/delivery/tracking/${id}`, { headers });
      if (!r.ok) {
        setError("Pa ka jwenn livrezon sa.");
        return;
      }
      const data = await r.json();
      setDelivery(data.delivery);
      setDriver(data.driver ?? null);
      setError("");
    } catch {
      if (!silent) setError("Erreur koneksyon. Eseye ankò.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id, token]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  }, [fetchData]);

  // Initial fetch + 10-second poll
  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(() => fetchData(true), 10_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchData]);

  // Stop polling on delivered / terminal states
  useEffect(() => {
    if (delivery && ["delivered", "returned", "failed_pickup", "cancelled"].includes(delivery.status)) {
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [delivery?.status]);

  if (loading && !delivery) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Ap chaje tracking...</Text>
      </View>
    );
  }

  if (error && !delivery) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle" size={48} color="#ef4444" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => fetchData()}>
          <Text style={styles.retryBtnText}>Eseye Ankò</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!delivery) return null;

  const isBuyer = user?.id === delivery.buyerId;
  const isMoto = driver?.vehicleType === "moto" || driver?.vehicleType === "motorcycle";
  const statusColor = STATUS_COLORS[delivery.status] ?? "#22c55e";
  const statusLabel = STATUS_LABELS[delivery.status] ?? delivery.status;
  const isDelivered = delivery.status === "delivered";
  const isWaiting = delivery.status === "waiting";

  return (
    <View style={styles.screen}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#f1f5f9" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Tracking Livrezon</Text>
          {delivery.trackingNumber && (
            <Text style={styles.headerTracking}>{delivery.trackingNumber}</Text>
          )}
        </View>
        <View style={styles.headerBadge}>
          <View style={[styles.headerBadgeDot, { backgroundColor: isDelivered ? "#10b981" : "#f97316" }]} />
          <Text style={styles.headerBadgeText}>FM</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Route animation ── */}
        <ProgressRoute status={delivery.status} isMoto={isMoto} />

        {/* ── Status pill ── */}
        <View style={[styles.statusPill, { borderColor: statusColor + "40", backgroundColor: statusColor + "18" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]}>
            {!isDelivered && <View style={[styles.statusPing, { backgroundColor: statusColor }]} />}
          </View>
          <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>

        {/* ── Waiting pulse ── */}
        {isWaiting && !driver && (
          <View style={styles.waitingCard}>
            <ActivityIndicator size="small" color="#f97316" />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.waitingTitle}>Ap chèche chofè ki disponib...</Text>
              <Text style={styles.waitingSubtitle}>Yon chofè ap aksepte kòmand ou byento</Text>
            </View>
          </View>
        )}

        {/* ── Delivered banner ── */}
        {isDelivered && (
          <View style={styles.deliveredBanner}>
            <View style={styles.deliveredIconWrapper}>
              <Ionicons name="checkmark-circle" size={40} color="#fff" />
            </View>
            <Text style={styles.deliveredBannerTitle}>Livrezon Konplè!</Text>
            <Text style={styles.deliveredBannerSub}>Kolis ou livré an sekirite pa FM</Text>
            {delivery.deliveredAt && (
              <Text style={styles.deliveredBannerDate}>
                {new Date(delivery.deliveredAt).toLocaleString("fr", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </Text>
            )}
          </View>
        )}

        {/* ── Driver card ── */}
        {driver && !isDelivered && (
          <DriverCard driver={driver} isMoto={isMoto} />
        )}

        {/* ── Verification code (buyer only) ── */}
        {isBuyer && delivery.verificationCode && !isDelivered && (
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>🔐 KÒD SEKRÈ OU</Text>
            <Text style={styles.codeValue}>{delivery.verificationCode}</Text>
            <Text style={styles.codeHint}>Bay chofè a kòd sa SÈLMAN lè li rive devan pòt ou</Text>
          </View>
        )}

        {/* ── Timeline ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ISTORIK LIVREZON</Text>
          <StepTimeline status={delivery.status} />
        </View>

        {/* ── Delivery info ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DETAY</Text>
          {delivery.pickupCity && (
            <View style={styles.infoRow}>
              <View style={[styles.infoColorDot, { backgroundColor: "#f97316" }]} />
              <Text style={styles.infoLabel}>Machann</Text>
              <Text style={styles.infoValue}>{delivery.pickupCity}</Text>
            </View>
          )}
          {delivery.deliveryCity && (
            <View style={styles.infoRow}>
              <View style={[styles.infoColorDot, { backgroundColor: "#22c55e" }]} />
              <Text style={styles.infoLabel}>Destinasyon</Text>
              <Text style={styles.infoValue}>{delivery.deliveryCity}</Text>
            </View>
          )}
          {delivery.feeUsd && (
            <View style={styles.infoRow}>
              <Ionicons name="wallet-outline" size={12} color="#64748b" style={{ marginRight: 8 }} />
              <Text style={styles.infoLabel}>Frè Livrezon</Text>
              <Text style={styles.infoValue}>${delivery.feeUsd.toFixed(2)}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={12} color="#64748b" style={{ marginRight: 8 }} />
            <Text style={styles.infoLabel}>Kòmand Pase</Text>
            <Text style={styles.infoValue}>
              {new Date(delivery.createdAt).toLocaleString("fr", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        </View>

        {/* ── Trust footer ── */}
        <View style={styles.trustRow}>
          <Ionicons name="shield-checkmark" size={14} color="#22c55e" />
          <Text style={styles.trustText}>Pwoteje pa FM Escrow System</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0f172a" },
  center: { flex: 1, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  loadingText: { color: "#64748b", fontSize: 14, marginTop: 8 },
  errorText: { color: "#ef4444", fontSize: 14, textAlign: "center" },
  retryBtn: { marginTop: 8, backgroundColor: "#1e293b", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 },
  retryBtnText: { color: "#f1f5f9", fontWeight: "700", fontSize: 14 },

  // Header
  header: { flexDirection: "row", alignItems: "center", padding: 16, paddingTop: 52, backgroundColor: "#0f172a", borderBottomWidth: 1, borderBottomColor: "#1e293b", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#f1f5f9" },
  headerTracking: { fontSize: 11, color: "#f97316", fontFamily: "monospace", letterSpacing: 1, marginTop: 1 },
  headerBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#1e293b", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  headerBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  headerBadgeText: { fontSize: 11, fontWeight: "900", color: "#f1f5f9", letterSpacing: 1 },

  // Map
  mapContainer: { height: 140, marginHorizontal: 16, marginTop: 12, borderRadius: 16, overflow: "hidden" },
  mapBg: { flex: 1, backgroundColor: "#1e293b", position: "relative" },
  gridLineV: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "rgba(255,255,255,0.04)" },
  gridLineH: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.04)" },
  routeTrack: { position: "absolute", left: 24, right: 24, top: "50%", height: 6, backgroundColor: "#1f2937", borderRadius: 3, marginTop: -3 },
  routeProgress: { height: "100%", borderRadius: 3 },
  originDot: { position: "absolute", left: 16, top: "50%", width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff", borderWidth: 2, marginTop: -8, alignItems: "center", justifyContent: "center", shadowColor: "#f97316", shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 },
  originInner: { width: 8, height: 8, borderRadius: 4 },
  destPin: { position: "absolute", right: 12, top: "50%", marginTop: -20 },
  vehicle: { position: "absolute", top: "50%", marginTop: -20, marginLeft: -18 },
  vehicleCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#fff", borderWidth: 2, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  vehiclePing: { position: "absolute", top: -3, right: -3, width: 10, height: 10, borderRadius: 5, opacity: 0.8 },
  deliveredOverlay: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", gap: 4 },
  deliveredLabel: { fontSize: 12, fontWeight: "900", color: "#10b981", letterSpacing: 2 },
  liveBadge: { position: "absolute", top: 8, right: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveBadgeText: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 1 },

  // Status pill
  statusPill: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 12, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5, position: "relative" },
  statusPing: { position: "absolute", width: 10, height: 10, borderRadius: 5, opacity: 0.4 },
  statusLabel: { fontSize: 15, fontWeight: "800", letterSpacing: 0.3 },

  // Waiting card
  waitingCard: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 10, backgroundColor: "#1e293b", borderRadius: 14, padding: 14 },
  waitingTitle: { fontSize: 13, fontWeight: "700", color: "#f1f5f9" },
  waitingSubtitle: { fontSize: 11, color: "#64748b", marginTop: 2 },

  // Delivered banner
  deliveredBanner: { margin: 16, backgroundColor: "#052e16", borderRadius: 16, padding: 20, alignItems: "center", borderWidth: 1, borderColor: "#14532d" },
  deliveredIconWrapper: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#10b981", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  deliveredBannerTitle: { fontSize: 20, fontWeight: "900", color: "#10b981" },
  deliveredBannerSub: { fontSize: 13, color: "#86efac", marginTop: 4 },
  deliveredBannerDate: { fontSize: 11, color: "#4ade80", marginTop: 6 },

  // Driver card
  driverCard: { marginHorizontal: 16, marginTop: 12, backgroundColor: "#1e293b", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#334155" },
  driverRow: { flexDirection: "row", alignItems: "flex-start" },
  driverAvatarWrapper: { position: "relative", width: 72, height: 72 },
  driverAvatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: "#22c55e" },
  onlineDot: { position: "absolute", top: 0, right: 0, width: 16, height: 16, borderRadius: 8, backgroundColor: "#22c55e", borderWidth: 2, borderColor: "#1e293b" },
  fmBadge: { position: "absolute", bottom: -2, left: "50%", backgroundColor: "#22c55e", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, transform: [{ translateX: -12 }] },
  fmBadgeText: { fontSize: 8, fontWeight: "900", color: "#fff", letterSpacing: 1 },
  driverName: { fontSize: 22, fontWeight: "900", color: "#f1f5f9" },
  vehicleBadge: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 4 },
  plateContainer: { alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderRadius: 10, borderWidth: 2, borderColor: "#d1d5db", padding: 6, minWidth: 80 },
  plateStripe: { width: "100%", height: 2, backgroundColor: "#22c55e", borderRadius: 1, marginVertical: 2 },
  plateText: { fontSize: 18, fontWeight: "900", color: "#111827", letterSpacing: 2, fontFamily: "monospace" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#0f172a", borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: "#22c55e20" },
  actionBtnLabel: { fontSize: 12, fontWeight: "700", color: "#94a3b8" },

  // Code card
  codeCard: { marginHorizontal: 16, marginTop: 12, backgroundColor: "#1a1060", borderRadius: 16, padding: 20, alignItems: "center", borderWidth: 1, borderColor: "#4f46e5" },
  codeLabel: { fontSize: 10, fontWeight: "900", color: "#818cf8", letterSpacing: 2, marginBottom: 10 },
  codeValue: { fontSize: 44, fontWeight: "900", color: "#fff", letterSpacing: 14, fontFamily: "monospace" },
  codeHint: { fontSize: 11, color: "#6366f1", marginTop: 10, textAlign: "center" },

  // Timeline
  timelineContainer: { gap: 0 },
  timelineStep: { flexDirection: "row", alignItems: "flex-start" },
  timelineIconCol: { alignItems: "center", width: 32 },
  stepIcon: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: "#0f172a" },
  stepConnector: { width: 2, height: 24, marginTop: 2 },
  stepLabelCol: { flex: 1, paddingBottom: 8, paddingLeft: 12, justifyContent: "center", minHeight: 32 },
  stepLabel: { fontSize: 13, fontWeight: "700" },

  // Section
  section: { marginHorizontal: 16, marginTop: 12, backgroundColor: "#1e293b", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#334155" },
  sectionTitle: { fontSize: 10, fontWeight: "900", color: "#475569", letterSpacing: 2, marginBottom: 14 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#0f172a" },
  infoColorDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  infoLabel: { flex: 1, fontSize: 13, color: "#64748b" },
  infoValue: { fontSize: 13, fontWeight: "700", color: "#cbd5e1" },

  // Trust footer
  trustRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20, paddingBottom: 8 },
  trustText: { fontSize: 11, color: "#334155" },
});
