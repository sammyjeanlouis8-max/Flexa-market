/**
 * Driver job detail + Haiti PIN confirm — WebView DriverJobDetail parity.
 * Route: /delivery/job/:id
 */
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, money } from "@/lib/request";

type Job = {
  id: number;
  orderRef?: string;
  status: string;
  listingTitle?: string | null;
  pickupCity?: string | null;
  pickupAddress?: string | null;
  deliveryCity?: string | null;
  deliveryAddress?: string | null;
  driverEarnings?: number | null;
  sellerName?: string | null;
  buyerName?: string | null;
  sellerNote?: string | null;
  pinRequired?: boolean;
  country?: string;
  allowedNext?: string[];
};

const NEXT_STATUS: Record<string, string> = {
  driver_assigned: "picked_up",
  arrived_pickup: "picked_up",
  picked_up: "on_the_way",
  on_the_way: "arrived",
};

const NEXT_LABEL: Record<string, string> = {
  driver_assigned: "Confirm pickup",
  arrived_pickup: "Confirm pickup",
  picked_up: "Mark on the way",
  on_the_way: "Arrived at customer",
};

export default function DriverJobDetailScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(id)) return;
    try {
      const data = await apiRequest<{ delivery?: Job } | Job>(`/delivery/${id}/driver-view`, {
        token,
      });
      const d = (data as any).delivery ?? data;
      setJob(d as Job);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load delivery");
    }
  }, [token, id]);

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace("/auth/login");
      return;
    }
    if (token) void load();
  }, [authLoading, token, router, load]);

  const advance = async () => {
    if (!token || !job) return;
    const allowed = job.allowedNext;
    const next =
      (Array.isArray(allowed) && allowed[0]) || NEXT_STATUS[job.status];
    if (!next) return;
    setBusy(true);
    try {
      await apiRequest(`/delivery/${job.id}/status`, {
        token,
        method: "PATCH",
        body: { status: next },
      });
      await load();
    } catch (e) {
      Alert.alert("Update failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  const verifyPin = async () => {
    if (!token || !job || pin.trim().length < 4) return;
    setBusy(true);
    try {
      await apiRequest(`/delivery/${job.id}/verify-code`, {
        token,
        method: "POST",
        body: { code: pin.trim() },
      });
      Alert.alert("Delivery confirmed", "PIN accepted. Order marked delivered.", [
        { text: "OK", onPress: () => router.replace("/driver-dashboard") },
      ]);
    } catch (e) {
      // Backend may 500 after success — reload to confirm
      await load();
      if (job.status === "delivered") {
        router.replace("/driver-dashboard");
        return;
      }
      Alert.alert("Invalid PIN", e instanceof Error ? e.message : "Check the buyer PIN");
    } finally {
      setBusy(false);
    }
  };

  if (!job && !error) {
    return (
      <View style={styles.root}>
        <AppHeader title="Delivery details" showBack />
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      </View>
    );
  }

  if (error && !job) {
    return (
      <View style={styles.root}>
        <AppHeader title="Delivery details" showBack />
        <View style={styles.center}>
          <Text style={styles.err}>{error}</Text>
          <Pressable style={styles.btn} onPress={() => router.back()}>
            <Text style={styles.btnText}>Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const nextLabel = NEXT_LABEL[job!.status] || null;
  const canAdvance = Boolean(NEXT_STATUS[job!.status] || (job!.allowedNext && job!.allowedNext[0]));
  const showPin = job!.status === "arrived" || job!.pinRequired === true;

  return (
    <View style={styles.root} testID="driver-job-detail">
      <AppHeader title="Delivery details" showBack />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.status}>{job!.status.replace(/_/g, " ")}</Text>
          <Text style={styles.title}>{job!.listingTitle || `Delivery #${job!.id}`}</Text>
          {job!.orderRef ? <Text style={styles.meta}>Order {job!.orderRef}</Text> : null}
          {job!.driverEarnings != null ? (
            <Text style={styles.pay}>Earn {money(job!.driverEarnings)}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Pickup</Text>
          <Text style={styles.route}>
            {[job!.pickupAddress, job!.pickupCity].filter(Boolean).join(", ") || "—"}
          </Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Drop-off</Text>
          <Text style={styles.route}>
            {[job!.deliveryAddress, job!.deliveryCity].filter(Boolean).join(", ") || "—"}
          </Text>
          {job!.sellerNote ? (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Seller note</Text>
              <Text style={styles.meta}>{job!.sellerNote}</Text>
            </>
          ) : null}
          {job!.buyerName ? <Text style={styles.meta}>Buyer: {job!.buyerName}</Text> : null}
          {job!.sellerName ? <Text style={styles.meta}>Seller: {job!.sellerName}</Text> : null}
        </View>

        {canAdvance && nextLabel && job!.status !== "arrived" && job!.status !== "delivered" ? (
          <Pressable
            style={[styles.btn, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={() => void advance()}
            testID="driver-job-advance"
          >
            <Text style={styles.btnText}>{busy ? "Updating…" : nextLabel}</Text>
          </Pressable>
        ) : null}

        {(showPin || job!.status === "arrived") && job!.status !== "delivered" ? (
          <View style={styles.pinCard} testID="driver-job-pin-panel">
            <Feather name="lock" size={18} color={colors.flexaOrange} />
            <Text style={styles.pinTitle}>Enter customer delivery PIN</Text>
            <Text style={styles.meta}>
              Hand the package to the customer, then enter their Haiti delivery PIN. No doorstep
              photo required.
            </Text>
            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              maxLength={8}
              placeholder="••••••"
              placeholderTextColor="#94A3B8"
              secureTextEntry
              testID="delivery-pin-input"
            />
            <Pressable
              style={[styles.btn, (busy || pin.trim().length < 4) && { opacity: 0.5 }]}
              disabled={busy || pin.trim().length < 4}
              onPress={() => void verifyPin()}
              testID="delivery-pin-confirm"
            >
              <Text style={styles.btnText}>{busy ? "Confirming…" : "Confirm delivery"}</Text>
            </Pressable>
          </View>
        ) : null}

        {job!.status === "delivered" ? (
          <View style={styles.done}>
            <Feather name="check-circle" size={28} color="#16A34A" />
            <Text style={styles.doneText}>Delivered</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  body: { padding: 16, paddingBottom: 40, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
  },
  status: { textTransform: "capitalize", color: colors.flexaGreen, fontWeight: "800", fontSize: 12 },
  title: { marginTop: 6, fontSize: 18, fontWeight: "900", color: colors.light.text },
  label: { fontSize: 11, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase" },
  route: { marginTop: 4, fontWeight: "700", color: colors.light.text },
  meta: { marginTop: 6, color: "#64748B", fontSize: 13 },
  pay: { marginTop: 8, fontWeight: "800", color: colors.flexaGreen, fontSize: 16 },
  btn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  pinCard: {
    backgroundColor: "#FFF7ED",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FDBA74",
    padding: 14,
    gap: 8,
  },
  pinTitle: { fontWeight: "900", color: colors.light.text, fontSize: 16 },
  pinInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 14,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 6,
    textAlign: "center",
    color: colors.light.text,
  },
  done: { alignItems: "center", gap: 8, padding: 24 },
  doneText: { fontWeight: "900", fontSize: 18, color: "#16A34A" },
  err: { color: colors.light.destructive, fontWeight: "700", textAlign: "center" },
});
