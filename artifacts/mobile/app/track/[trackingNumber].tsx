/**
 * Public tracking detail — GET /api/track/:trackingNumber
 */
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { apiRequest, formatWhen } from "@/lib/request";

type Delivery = {
  id: number;
  trackingNumber?: string;
  status?: string;
  deliveryCity?: string | null;
  pickupCity?: string | null;
  country?: string | null;
  createdAt?: string;
  acceptedAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  driverFirstName?: string | null;
  driverVehicleType?: string | null;
  estimatedMinutes?: number | null;
};

const STEPS = ["pending", "accepted", "picked_up", "in_transit", "delivered"] as const;

export default function TrackDetailScreen() {
  const { trackingNumber } = useLocalSearchParams<{ trackingNumber: string }>();
  const tn = decodeURIComponent(Array.isArray(trackingNumber) ? trackingNumber[0] : trackingNumber || "");
  const router = useRouter();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!tn) return;
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const res = await apiRequest<{ delivery: Delivery }>(`/track/${encodeURIComponent(tn)}`);
        setDelivery(res.delivery);
        setError(null);
      } catch (e) {
        setDelivery(null);
        setError(e instanceof Error ? e.message : "Tracking not found");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tn],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const status = (delivery?.status || "pending").toLowerCase();
  const activeIdx = Math.max(
    0,
    STEPS.findIndex((s) => status.includes(s.replace("_", "")) || status === s || status.includes(s)),
  );

  return (
    <View style={styles.root}>
      <AppHeader title={tn || "Tracking"} showBack />
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={colors.flexaGreen} />
          }
        >
          {error ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retry}>Retry</Text>
              </Pressable>
              <Pressable onPress={() => router.replace("/track")}>
                <Text style={styles.retry}>Try another number</Text>
              </Pressable>
            </View>
          ) : null}
          {delivery ? (
            <>
              <View style={styles.card}>
                <Text style={styles.status}>{delivery.status?.replace(/_/g, " ")}</Text>
                <Text style={styles.route}>
                  {delivery.pickupCity || "Pickup"} → {delivery.deliveryCity || "Destination"}
                </Text>
                {delivery.country ? <Text style={styles.meta}>{delivery.country}</Text> : null}
                {delivery.driverFirstName ? (
                  <Text style={styles.meta}>
                    Driver {delivery.driverFirstName}
                    {delivery.driverVehicleType ? ` · ${delivery.driverVehicleType}` : ""}
                  </Text>
                ) : null}
                {delivery.estimatedMinutes != null ? (
                  <Text style={styles.eta}>ETA ~{delivery.estimatedMinutes} min</Text>
                ) : null}
              </View>
              <Text style={styles.section}>Progress</Text>
              {STEPS.map((step, i) => {
                const done = i <= activeIdx || status === "delivered";
                return (
                  <View key={step} style={styles.step}>
                    <View style={[styles.dot, done && styles.dotOn]}>
                      {done ? <Feather name="check" size={12} color="#fff" /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.stepTitle, done && { color: colors.flexaGreen }]}>
                        {step.replace(/_/g, " ")}
                      </Text>
                      {step === "accepted" && delivery.acceptedAt ? (
                        <Text style={styles.meta}>{formatWhen(delivery.acceptedAt)}</Text>
                      ) : null}
                      {step === "picked_up" && delivery.pickedUpAt ? (
                        <Text style={styles.meta}>{formatWhen(delivery.pickedUpAt)}</Text>
                      ) : null}
                      {step === "delivered" && delivery.deliveredAt ? (
                        <Text style={styles.meta}>{formatWhen(delivery.deliveredAt)}</Text>
                      ) : null}
                      {step === "pending" ? (
                        <Text style={styles.meta}>{formatWhen(delivery.createdAt)}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { backgroundColor: "#FEF2F2", padding: 12, borderRadius: 12, gap: 6 },
  bannerText: { color: "#B91C1C" },
  retry: { color: colors.flexaGreen, fontWeight: "700" },
  card: {
    backgroundColor: colors.flexaGreen,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  status: { color: "#fff", fontWeight: "900", fontSize: 20, textTransform: "capitalize" },
  route: { color: "rgba(255,255,255,0.9)", marginTop: 6, fontWeight: "600" },
  meta: { color: "#94A3B8", fontSize: 12, marginTop: 2 },
  eta: { marginTop: 10, color: "#fff", fontWeight: "800" },
  section: { fontWeight: "800", marginBottom: 10, color: colors.light.text },
  step: { flexDirection: "row", gap: 12, marginBottom: 14 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  dotOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  stepTitle: { fontWeight: "700", color: "#64748B", textTransform: "capitalize" },
});
