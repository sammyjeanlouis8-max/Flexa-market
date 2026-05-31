import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Dimensions, Linking, Platform,
  Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_W } = Dimensions.get("window");
const MAP_W = SCREEN_W - 32;
const MAP_H = 220;

// Haiti bounding box for SVG coordinate mapping
const LAT_MIN = 18.0, LAT_MAX = 20.1;
const LNG_MIN = -74.5, LNG_MAX = -71.7;

function coordsToSvg(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * MAP_W;
  const y = MAP_H - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * MAP_H;
  return { x: Math.max(10, Math.min(MAP_W - 10, x)), y: Math.max(10, Math.min(MAP_H - 10, y)) };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const STAGES = [
  { key: "waiting", label: "Annatant" },
  { key: "driver_assigned", label: "Chofè Asiye" },
  { key: "picked_up", label: "Ramase" },
  { key: "on_the_way", label: "En Route" },
  { key: "arrived", label: "Rive" },
  { key: "delivered", label: "Livre" },
];
const STATUS_COLOR: Record<string, string> = {
  waiting: "#F59E0B", driver_assigned: "#0EA5E9", picked_up: "#8B5CF6",
  on_the_way: "#3B82F6", arrived: "#22C55E", delivered: "#22C55E",
  buyer_absent: "#EF4444", failed_pickup: "#EF4444", returning: "#F97316",
};

export default function DeliveryTrackingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const { id } = useLocalSearchParams<{ id: string }>();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [tracking, setTracking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [driverLat, setDriverLat] = useState<number | null>(null);
  const [driverLng, setDriverLng] = useState<number | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTracking = useCallback(async () => {
    if (!id) return;
    try {
      const data = await request<any>(`/delivery/tracking/${id}`);
      setTracking(data);
      if (data?.driver?.lat && data?.driver?.lng) {
        setDriverLat(data.driver.lat);
        setDriverLng(data.driver.lng);
        if (data?.destinationLat && data?.destinationLng) {
          const km = haversineKm(data.driver.lat, data.driver.lng, data.destinationLat, data.destinationLng);
          const mins = Math.round((km / 30) * 60);
          setEta(mins < 2 ? "< 2 min" : `~${mins} min`);
        }
      }
    } catch { }
  }, [id, request]);

  useEffect(() => {
    setLoading(true);
    fetchTracking().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchTracking, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchTracking]);

  const stageIdx = STAGES.findIndex((s) => s.key === tracking?.status);
  const statusColor = STATUS_COLOR[tracking?.status] ?? colors.mutedForeground;
  const isLive = ["driver_assigned", "picked_up", "on_the_way", "arrived"].includes(tracking?.status ?? "");
  const isDelivered = tracking?.status === "delivered";

  const driverPos = driverLat && driverLng ? coordsToSvg(driverLat, driverLng) : null;

  const openMaps = () => {
    if (!driverLat || !driverLng) return;
    const url = `https://maps.google.com/?q=${driverLat},${driverLng}`;
    Linking.openURL(url);
  };

  const callDriver = () => {
    const phone = tracking?.driver?.phone;
    if (!phone) { Alert.alert("Pa disponib", "Nimewo chofè a pa disponib."); return; }
    Linking.openURL(`tel:${phone}`);
  };

  const msgDriver = () => {
    const phone = tracking?.driver?.phone;
    if (!phone) { Alert.alert("Pa disponib", "Nimewo chofè a pa disponib."); return; }
    Linking.openURL(`https://wa.me/${phone.replace(/\D/g, "")}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 10, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Swiv Livrezon</Text>
          {id && <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>#{id}</Text>}
        </View>
        <TouchableOpacity onPress={fetchTracking} style={styles.headerBtn}>
          <Feather name="refresh-cw" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : !tracking ? (
        <View style={styles.centered}>
          <Feather name="package" size={52} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Livrezon pa jwenn</Text>
          <Pressable style={[styles.retryBtn, { backgroundColor: colors.accent }]} onPress={() => { setLoading(true); fetchTracking().finally(() => setLoading(false)); }}>
            <Text style={styles.retryText}>Eseye Ankò</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {/* SVG Map */}
          <View style={[styles.mapContainer, { backgroundColor: "#1a2744" }]}>
            {/* GPS LIVE badge */}
            {isLive && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>GPS LIVE</Text>
              </View>
            )}
            {/* ETA badge */}
            {eta && isLive && (
              <View style={[styles.etaBadge, { backgroundColor: colors.card }]}>
                <Feather name="clock" size={12} color={colors.primary} />
                <Text style={[styles.etaText, { color: colors.foreground }]}>ETA {eta}</Text>
              </View>
            )}
            {/* Simple map visualization */}
            <View style={styles.mapGrid}>
              {[...Array(6)].map((_, i) => (
                <View key={i} style={[styles.mapGridLine, { backgroundColor: "rgba(255,255,255,0.04)" }]} />
              ))}
            </View>
            {/* Streets */}
            {[
              { x1: "0%", y1: "40%", x2: "100%", y2: "40%" },
              { x1: "0%", y1: "70%", x2: "100%", y2: "70%" },
              { x1: "30%", y1: "0%", x2: "30%", y2: "100%" },
              { x1: "65%", y1: "0%", x2: "65%", y2: "100%" },
            ].map((s, i) => (
              <View key={i} style={[styles.mapStreet, { left: s.x1, top: s.y1, right: s.x2 === "100%" ? 0 : undefined }]} />
            ))}
            {/* Driver dot */}
            {driverPos && (
              <View style={[styles.driverDot, { left: driverPos.x - 14, top: driverPos.y - 14 }]}>
                <View style={styles.driverDotPulse} />
                <Text style={styles.driverEmoji}>
                  {tracking?.driver?.vehicleType === "car" ? "🚗" : "🏍️"}
                </Text>
              </View>
            )}
            {/* Destination pin */}
            {tracking?.destinationLat && tracking?.destinationLng && (() => {
              const pos = coordsToSvg(tracking.destinationLat, tracking.destinationLng);
              return (
                <View style={[styles.destPin, { left: pos.x - 12, top: pos.y - 24 }]}>
                  <Feather name="map-pin" size={24} color="#EF4444" />
                </View>
              );
            })()}
            {!driverPos && (
              <View style={styles.mapPlaceholder}>
                <Feather name="map" size={36} color="rgba(255,255,255,0.3)" />
                <Text style={styles.mapPlaceholderText}>
                  {tracking?.status === "waiting" ? "Ap chèche chofè..." : "Karte pa disponib"}
                </Text>
              </View>
            )}
          </View>

          {/* Status Banner */}
          {tracking?.status === "buyer_absent" && (
            <View style={[styles.banner, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
              <Feather name="alert-triangle" size={16} color="#F59E0B" />
              <Text style={styles.bannerText}>⚠️ Chofè te rive men pa jwenn ou. Frè retou aplikab.</Text>
            </View>
          )}
          {isDelivered && (
            <View style={[styles.banner, { backgroundColor: "#DCFCE7", borderColor: "#22C55E" }]}>
              <Feather name="check-circle" size={16} color="#22C55E" />
              <Text style={[styles.bannerText, { color: "#166534" }]}>✅ Pakè ou livre avèk siksè!</Text>
            </View>
          )}

          {/* Progress Timeline */}
          <View style={[styles.timelineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Estati Livrezon</Text>
            <View style={styles.timeline}>
              {STAGES.map((stage, i) => {
                const done = i <= stageIdx;
                const active = i === stageIdx;
                return (
                  <View key={stage.key} style={styles.timelineItem}>
                    <View style={[styles.timelineDot, { backgroundColor: done ? statusColor : colors.border, transform: [{ scale: active ? 1.3 : 1 }] }]}>
                      {done && <Feather name="check" size={10} color="#fff" />}
                    </View>
                    {i < STAGES.length - 1 && <View style={[styles.timelineLine, { backgroundColor: done ? statusColor : colors.border }]} />}
                    <Text style={[styles.timelineLabel, { color: done ? colors.foreground : colors.mutedForeground, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular" }]}>{stage.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Driver Card */}
          {tracking?.driver && (
            <View style={[styles.driverCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.driverAvatar, { backgroundColor: colors.border }]}>
                <Feather name="user" size={28} color={colors.mutedForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.driverName, { color: colors.foreground }]}>{tracking.driver.name ?? "Chofè FM"}</Text>
                <View style={styles.driverMeta}>
                  <Text style={[styles.driverRating, { color: "#F59E0B" }]}>⭐ {tracking.driver.rating?.toFixed(1) ?? "—"}</Text>
                  <Text style={[styles.driverVehicle, { color: colors.mutedForeground }]}>
                    {tracking.driver.vehicleType === "car" ? "🚗" : "🏍️"} {tracking.driver.vehicleBrand ?? ""} {tracking.driver.vehicleModel ?? ""}
                  </Text>
                </View>
                {tracking.driver.plateNumber && (
                  <View style={[styles.plateView, { backgroundColor: "#FFF9C4", borderColor: "#F59E0B" }]}>
                    <Text style={styles.plateText}>🚘 {tracking.driver.plateNumber}</Text>
                  </View>
                )}
              </View>
              <View style={styles.driverActions}>
                <TouchableOpacity style={[styles.driverActionBtn, { backgroundColor: "#22C55E22" }]} onPress={callDriver}>
                  <Feather name="phone" size={18} color="#22C55E" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.driverActionBtn, { backgroundColor: "#25D36622" }]} onPress={msgDriver}>
                  <Feather name="message-circle" size={18} color="#25D366" />
                </TouchableOpacity>
                {driverPos && (
                  <TouchableOpacity style={[styles.driverActionBtn, { backgroundColor: "#3B82F622" }]} onPress={openMaps}>
                    <Feather name="map-pin" size={18} color="#3B82F6" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Verification Code */}
          {tracking?.verificationCode && !isDelivered && (
            <View style={[styles.codeCard, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
              <Feather name="key" size={20} color="#F59E0B" />
              <View style={{ flex: 1 }}>
                <Text style={styles.codeLabel}>Kòd Konfirmasyon</Text>
                <Text style={styles.codeVal}>{tracking.verificationCode}</Text>
                <Text style={styles.codeHint}>Ba chofè a kòd sa sèlman lè li rive ak pakè ou.</Text>
              </View>
            </View>
          )}

          {/* Order Info */}
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Detay Kòmand</Text>
            {[
              { label: "Estati", val: tracking.status?.replace(/_/g, " ") },
              { label: "Kòmand #", val: String(tracking.orderId ?? id) },
              { label: "Vil Ramase", val: tracking.pickupCity ?? "—" },
              { label: "Vil Livrezon", val: tracking.deliveryCity ?? "—" },
            ].map((r) => (
              <View key={r.label} style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                <Text style={[styles.infoVal, { color: colors.foreground }]}>{r.val}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  mapContainer: { margin: 16, borderRadius: 20, height: MAP_H, position: "relative", overflow: "hidden" },
  liveBadge: { position: "absolute", top: 12, left: 12, zIndex: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" },
  liveText: { color: "#22C55E", fontSize: 11, fontFamily: "Inter_700Bold" },
  etaBadge: { position: "absolute", top: 12, right: 12, zIndex: 10, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  etaText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  mapGrid: { position: "absolute", inset: 0, flexDirection: "column", justifyContent: "space-around" },
  mapGridLine: { height: 1, width: "100%" },
  mapStreet: { position: "absolute", height: 2, backgroundColor: "rgba(255,255,255,0.08)" },
  driverDot: { position: "absolute", width: 28, height: 28, alignItems: "center", justifyContent: "center", zIndex: 5 },
  driverDotPulse: { position: "absolute", width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(34,197,94,0.25)" },
  driverEmoji: { fontSize: 18 },
  destPin: { position: "absolute", zIndex: 5 },
  mapPlaceholder: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", gap: 8 },
  mapPlaceholderText: { color: "rgba(255,255,255,0.4)", fontSize: 13, fontFamily: "Inter_400Regular" },
  banner: { marginHorizontal: 16, marginBottom: 8, borderRadius: 12, borderWidth: 1, padding: 12, flexDirection: "row", gap: 10, alignItems: "center" },
  bannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: "#92400E" },
  timelineCard: { marginHorizontal: 16, marginBottom: 8, borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  timeline: { flexDirection: "row", alignItems: "flex-start" },
  timelineItem: { flex: 1, alignItems: "center", gap: 4 },
  timelineDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  timelineLine: { position: "absolute", top: 11, left: "50%", width: "100%", height: 2 },
  timelineLabel: { fontSize: 9, textAlign: "center" },
  driverCard: { marginHorizontal: 16, marginBottom: 8, borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  driverAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  driverName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  driverMeta: { flexDirection: "row", gap: 10, marginTop: 2 },
  driverRating: { fontSize: 12, fontFamily: "Inter_500Medium" },
  driverVehicle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  plateView: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start", marginTop: 4 },
  plateText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#92400E" },
  driverActions: { flexDirection: "column", gap: 6 },
  driverActionBtn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  codeCard: { marginHorizontal: 16, marginBottom: 8, borderRadius: 14, borderWidth: 2, padding: 14, flexDirection: "row", gap: 12, alignItems: "flex-start" },
  codeLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#92400E" },
  codeVal: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#92400E", letterSpacing: 4 },
  codeHint: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#B45309", marginTop: 2 },
  infoCard: { marginHorizontal: 16, marginBottom: 8, borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  infoRow: { flexDirection: "row", justifyContent: "space-between" },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoVal: { fontSize: 13, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
});
