import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

// ── Return window per country ─────────────────────────────────────────────────
function getReturnDays(country: string | null | undefined): number {
  const map: Record<string, number> = {
    "USA": 30, "Canada": 30, "Australia": 30,
    "United Kingdom": 14, "France": 14, "Germany": 14, "Italy": 14,
    "Netherlands": 14, "Belgium": 14, "Portugal": 14, "Switzerland": 14,
    "Sweden": 14, "Norway": 14, "Japan": 14, "South Korea": 14,
    "Brazil": 14, "Mexico": 14, "Colombia": 14, "Chile": 14, "South Africa": 14,
    "Jamaica": 7, "Trinidad and Tobago": 7, "Barbados": 7,
    "Bahamas": 7, "Puerto Rico": 7, "Haiti": 3, "Dominican Republic": 3,
    "Nigeria": 7, "Ghana": 7, "Kenya": 7, "Senegal": 7,
    "Philippines": 7, "India": 7, "United Arab Emirates": 7, "Saudi Arabia": 7,
  };
  return map[country ?? ""] ?? 14;
}

// ── Carrier tracking URLs ─────────────────────────────────────────────────────
function trackingUrl(carrier: string, trackingNumber: string): string {
  const num = encodeURIComponent(trackingNumber);
  const urls: Record<string, string> = {
    "UPS":   `https://www.ups.com/track?tracknum=${num}`,
    "FedEx": `https://www.fedex.com/apps/fedextrack/?tracknumbers=${num}`,
    "DHL":   `https://www.dhl.com/en/express/tracking.html?AWB=${num}`,
    "USPS":  `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${num}`,
  };
  return urls[carrier] ?? `https://www.google.com/search?q=${encodeURIComponent(carrier)}+tracking+${num}`;
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  pending:          "Annatant",
  ready_to_ship:    "Pare pou ekspedye",
  shipped:          "Ekspedye",
  delivered:        "Livré",
  completed:        "Konplète",
  cancelled:        "Anile",
  return_refunded:  "Retounen · Ranbouse",
};

const STATUS_COLOR: Record<string, string> = {
  pending:         "#F59E0B",
  ready_to_ship:   "#3B82F6",
  shipped:         "#8B5CF6",
  delivered:       "#22C55E",
  completed:       "#10B981",
  cancelled:       "#EF4444",
  return_refunded: "#94A3B8",
};

const TIMELINE_STEPS = ["pending", "shipped", "delivered", "completed"];
const TIMELINE_LABELS: Record<string, string> = {
  pending:   "Kòmand resevwa",
  shipped:   "Ekspedye",
  delivered: "Livré",
  completed: "Konplète",
};

type Order = {
  orderId: number;
  orderRef: string;
  orderStatus: string;
  amount: number;
  currency: string;
  createdAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  completedAt?: string | null;
  listingCountry: string | null;
  isHaiti: boolean;
  isBuyer: boolean;
  isSeller: boolean;
  trackingNumber: string | null;
  carrier: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  listing: { id: number; title: string; images?: string[] | null };
  buyerName?: string;
  sellerName?: string;
  autoReleaseAt?: string | null;
};

type ReturnInfo = {
  id: number;
  status: string;
  reason?: string;
  refund_amount?: string;
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { request } = useApi();

  const [order, setOrder] = useState<Order | null>(null);
  const [returnInfo, setReturnInfo] = useState<ReturnInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  const orderId = parseInt(id ?? "0", 10);

  const load = useCallback(async () => {
    try {
      const data = await request<Order>(`/orders/${orderId}`);
      setOrder(data);
    } catch {
      setError("Kòmand pa jwenn");
    }
  }, [orderId, request]);

  const loadReturn = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}/return`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setReturnInfo(await res.json());
    } catch { /* ignore */ }
  }, [orderId, token]);

  useEffect(() => {
    setLoading(true);
    Promise.all([load(), loadReturn()]).finally(() => setLoading(false));
  }, [load, loadReturn]);

  const confirmDelivery = async () => {
    if (!order) return;
    Alert.alert(
      "Konfime resepsyon",
      "Ou sèten ou resevwa pwodwi a? Aksyon sa a lib lajan an bay vandè a.",
      [
        { text: "Anile", style: "cancel" },
        {
          text: "Wi, m resevwa l",
          style: "default",
          onPress: async () => {
            setConfirming(true);
            try {
              const res = await fetch(`/api/orders/${orderId}/confirm`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) { await load(); }
              else Alert.alert("Erè", "Pa kapab konfime pou kounye a");
            } finally { setConfirming(false); }
          },
        },
      ]
    );
  };

  const requestReturn = async () => {
    if (!order) return;
    Alert.alert(
      "Retounen pwodwi a",
      "Ou vle fè yon demann retou pou lòd sa a?",
      [
        { text: "Anile", style: "cancel" },
        {
          text: "Wi, retounen",
          style: "destructive",
          onPress: async () => {
            try {
              await fetch(`/api/orders/${orderId}/return`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ reason: "not_as_described", description: "" }),
              });
              await loadReturn();
            } catch { Alert.alert("Erè", "Pa kapab fè demann retou pou kounye a"); }
          },
        },
      ]
    );
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 20 : insets.bottom;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={[styles.errorText, { color: colors.foreground }]}>{error || "Kòmand pa jwenn"}</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backPill, { backgroundColor: colors.muted }]}>
          <Text style={[styles.backPillText, { color: colors.foreground }]}>Tounen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = STATUS_COLOR[order.orderStatus] ?? "#94A3B8";
  const returnDays  = getReturnDays(order.listingCountry);
  const now         = new Date();
  const completedAt = order.completedAt ? new Date(order.completedAt) : null;
  const inReturnWindow = completedAt ? (now.getTime() - completedAt.getTime()) / 86400000 <= returnDays : false;

  // Timeline: find current step index
  const currentStep = TIMELINE_STEPS.indexOf(["delivered", "completed"].includes(order.orderStatus) ? "completed" : order.orderStatus);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 10, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Kòmand #{order.orderId}</Text>
          <Text style={[styles.headerRef, { color: colors.mutedForeground }]}>{order.orderRef}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: botPad + 20 }}>

        {/* ── Status badge ── */}
        <View style={[styles.statusRow, { backgroundColor: statusColor + "18", borderColor: statusColor + "44" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABEL[order.orderStatus] ?? order.orderStatus}</Text>
          <Text style={[styles.amountText, { color: colors.foreground }]}>${order.amount?.toFixed(2)} {order.currency}</Text>
        </View>

        {/* ── Listing title ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="package" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.listingTitle, { color: colors.foreground }]} numberOfLines={2}>
              {order.listing?.title}
            </Text>
            <Text style={[styles.subText, { color: colors.mutedForeground }]}>
              {order.isBuyer ? `Vandè: ${order.sellerName ?? "—"}` : `Achetè: ${order.buyerName ?? "—"}`}
            </Text>
          </View>
        </View>

        {/* ── Timeline ── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.mutedForeground }]}>TIMELINE</Text>
          <View style={styles.timeline}>
            {TIMELINE_STEPS.map((step, i) => {
              const done = i <= currentStep;
              const active = i === currentStep;
              return (
                <View key={step} style={styles.timelineRow}>
                  <View style={styles.timelineLeft}>
                    <View style={[styles.timelineDot, {
                      backgroundColor: done ? colors.primary : colors.muted,
                      borderColor: active ? colors.primary : colors.border,
                      width: active ? 18 : 14,
                      height: active ? 18 : 14,
                      borderRadius: active ? 9 : 7,
                    }]} />
                    {i < TIMELINE_STEPS.length - 1 && (
                      <View style={[styles.timelineLine, { backgroundColor: i < currentStep ? colors.primary : colors.border }]} />
                    )}
                  </View>
                  <Text style={[styles.timelineLabel, { color: done ? colors.foreground : colors.mutedForeground, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular" }]}>
                    {TIMELINE_LABELS[step]}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Tracking (non-Haiti) ── */}
        {!order.isHaiti && order.trackingNumber && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.mutedForeground }]}>TRACKING</Text>
            <View style={styles.trackingRow}>
              <View style={[styles.carrierBadge, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="truck" size={14} color={colors.primary} />
                <Text style={[styles.carrierName, { color: colors.primary }]}>{order.carrier}</Text>
              </View>
              <Text style={[styles.trackingNum, { color: colors.foreground }]} selectable>
                {order.trackingNumber}
              </Text>
            </View>
            <Pressable
              style={[styles.trackBtn, { backgroundColor: colors.primary }]}
              onPress={() => Linking.openURL(trackingUrl(order.carrier!, order.trackingNumber!))}
            >
              <Feather name="external-link" size={14} color="#FFF" />
              <Text style={styles.trackBtnText}>Suiv sou {order.carrier}</Text>
            </Pressable>
          </View>
        )}

        {/* ── FM Driver (Haiti/DR) ── */}
        {order.isHaiti && order.driverPhone && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.mutedForeground }]}>CHOFÈ FM</Text>
            <Text style={[styles.driverName, { color: colors.foreground }]}>{order.driverName ?? "Chofè FlexaMarket"}</Text>
            <Pressable
              style={[styles.trackBtn, { backgroundColor: "#22C55E" }]}
              onPress={() => Linking.openURL(`tel:${order.driverPhone}`)}
            >
              <Feather name="phone" size={14} color="#FFF" />
              <Text style={styles.trackBtnText}>📞 {order.driverPhone}</Text>
            </Pressable>
          </View>
        )}

        {/* ── Politique retou ── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.mutedForeground }]}>LIVREZON &amp; RETOU</Text>

          <View style={[styles.policyRow, { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" }]}>
            <Text style={styles.policyIcon}>↩️</Text>
            <View>
              <Text style={[styles.policyTitle, { color: "#166534" }]}>{returnDays} jou retou garanti</Text>
              <Text style={[styles.policyDesc, { color: "#15803D" }]}>Si pa kòrèk jan yo dekri l, ou ka retounen l</Text>
            </View>
          </View>

          {!order.isHaiti ? (
            <View style={[styles.policyRow, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
              <Text style={styles.policyIcon}>📦</Text>
              <View>
                <Text style={[styles.policyTitle, { color: "#1E3A8A" }]}>USPS · DHL · FedEx · UPS</Text>
                <Text style={[styles.policyDesc, { color: "#1D4ED8" }]}>Transpòtè lokal ak traking</Text>
              </View>
            </View>
          ) : (
            <View style={[styles.policyRow, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
              <Text style={styles.policyIcon}>🚗</Text>
              <View>
                <Text style={[styles.policyTitle, { color: "#1E3A8A" }]}>Chofè FlexaMarket</Text>
                <Text style={[styles.policyDesc, { color: "#1D4ED8" }]}>Traking an tan reyèl · Kòd sekrè</Text>
              </View>
            </View>
          )}

          <View style={[styles.policyRow, { backgroundColor: "#FAF5FF", borderColor: "#E9D5FF" }]}>
            <Text style={styles.policyIcon}>🔒</Text>
            <View>
              <Text style={[styles.policyTitle, { color: "#6B21A8" }]}>Peman pwoteje (Escrow)</Text>
              <Text style={[styles.policyDesc, { color: "#7E22CE" }]}>Lajan lib sèlman apre ou konfime resepsyon</Text>
            </View>
          </View>
        </View>

        {/* ── Return info (if requested) ── */}
        {returnInfo && (
          <View style={[styles.card, { backgroundColor: "#FFF7ED", borderColor: "#FED7AA" }]}>
            <Text style={[styles.cardTitle, { color: "#9A3412" }]}>DEMANN RETOU</Text>
            <View style={[styles.returnStatusBadge, {
              backgroundColor: returnInfo.status === "refunded" ? "#22C55E22" : "#F59E0B22",
              borderColor: returnInfo.status === "refunded" ? "#22C55E" : "#F59E0B",
            }]}>
              <Text style={[styles.returnStatusText, { color: returnInfo.status === "refunded" ? "#166534" : "#92400E" }]}>
                {returnInfo.status === "refunded" ? "✅ Ranbouse" :
                 returnInfo.status === "requested" ? "⏳ Annatant" :
                 returnInfo.status === "seller_accepted" ? "✅ Vandè aksepte" :
                 returnInfo.status}
              </Text>
            </View>
            {returnInfo.refund_amount && (
              <Text style={[styles.refundAmount, { color: "#166534" }]}>
                ${parseFloat(returnInfo.refund_amount).toFixed(2)} ranbouse ✅
              </Text>
            )}
          </View>
        )}

        {/* ── Action buttons ── */}
        <View style={styles.actions}>
          {/* Confirm delivery (buyer, delivered status) */}
          {order.isBuyer && order.orderStatus === "delivered" && (
            <Pressable
              style={[styles.actionBtn, { backgroundColor: "#22C55E" }]}
              onPress={confirmDelivery}
              disabled={confirming}
            >
              {confirming ? <ActivityIndicator color="#FFF" size="small" /> : (
                <>
                  <Feather name="check-circle" size={18} color="#FFF" />
                  <Text style={styles.actionBtnText}>Konfime m resevwa pwodwi a</Text>
                </>
              )}
            </Pressable>
          )}

          {/* Request return (buyer, completed, in window, no existing return) */}
          {order.isBuyer && order.orderStatus === "completed" && inReturnWindow && !returnInfo && (
            <Pressable
              style={[styles.actionBtn, { backgroundColor: "#EF4444" }]}
              onPress={requestReturn}
            >
              <Feather name="rotate-ccw" size={18} color="#FFF" />
              <Text style={styles.actionBtnText}>Demande retou ({returnDays} jou)</Text>
            </Pressable>
          )}

          {/* View listing */}
          {order.listing?.id && (
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => router.push({ pathname: "/listing/[id]", params: { id: String(order.listing.id) } })}
            >
              <Feather name="eye" size={18} color={colors.foreground} />
              <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Wè lis pwodwi a</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1 },
  center:          { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  errorText:       { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center" },
  backPill:        { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  backPillText:    { fontSize: 14, fontFamily: "Inter_500Medium" },
  header:          { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, gap: 12 },
  backBtn:         { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter:    { flex: 1, alignItems: "center" },
  headerTitle:     { fontSize: 17, fontFamily: "Inter_700Bold" },
  headerRef:       { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusRow:       { flexDirection: "row", alignItems: "center", gap: 10, margin: 16, padding: 14, borderRadius: 14, borderWidth: 1 },
  statusDot:       { width: 10, height: 10, borderRadius: 5 },
  statusText:      { flex: 1, fontSize: 14, fontFamily: "Inter_700Bold" },
  amountText:      { fontSize: 16, fontFamily: "Inter_700Bold" },
  section:         { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  listingTitle:    { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  subText:         { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  card:            { marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 16, borderWidth: 1 },
  cardTitle:       { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5, marginBottom: 12 },
  timeline:        { gap: 0 },
  timelineRow:     { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  timelineLeft:    { alignItems: "center", width: 20 },
  timelineDot:     { borderWidth: 2 },
  timelineLine:    { width: 2, flex: 1, minHeight: 28, marginVertical: 2 },
  timelineLabel:   { fontSize: 13, paddingTop: 1, paddingBottom: 20 },
  trackingRow:     { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" },
  carrierBadge:    { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  carrierName:     { fontSize: 13, fontFamily: "Inter_700Bold" },
  trackingNum:     { fontSize: 14, fontFamily: "Inter_700Bold", fontVariant: ["tabular-nums"] as any },
  trackBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12 },
  trackBtnText:    { color: "#FFF", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  driverName:      { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  policyRow:       { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  policyIcon:      { fontSize: 22 },
  policyTitle:     { fontSize: 13, fontFamily: "Inter_700Bold" },
  policyDesc:      { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  returnStatusBadge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, alignSelf: "flex-start", marginBottom: 8 },
  returnStatusText:  { fontSize: 13, fontFamily: "Inter_700Bold" },
  refundAmount:    { fontSize: 15, fontFamily: "Inter_700Bold" },
  actions:         { marginHorizontal: 16, gap: 10, marginTop: 4 },
  actionBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, borderRadius: 14 },
  actionBtnText:   { color: "#FFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
