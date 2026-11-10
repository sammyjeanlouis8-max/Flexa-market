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
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fetchPublicTracking,
  type PublicTracking,
} from "@/lib/publicShopApi";

export default function PublicTrackScreen() {
  const { trackingNumber: paramTn } = useLocalSearchParams<{
    trackingNumber: string;
  }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [input, setInput] = useState(String(paramTn || "").toUpperCase());
  const [data, setData] = useState<PublicTracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (tn: string) => {
    const cleaned = tn.trim().toUpperCase();
    if (!cleaned) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPublicTracking(cleaned);
      setData(result);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Tracking failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (paramTn) void load(String(paramTn));
  }, [paramTn, load]);

  const d = data?.delivery;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Track package</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => load(input)}
            tintColor="#F97316"
          />
        }
      >
        <Text style={styles.hint}>Enter an FM- tracking number (guest-safe).</Text>
        <View style={styles.row}>
          <TextInput
            value={input}
            onChangeText={(t) => setInput(t.toUpperCase())}
            autoCapitalize="characters"
            placeholder="FM-XXXXXXXXX"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            testID="input-tracking-number"
          />
          <Pressable
            style={styles.searchBtn}
            onPress={() => load(input)}
            testID="btn-track-lookup"
          >
            <Feather name="search" size={18} color="#fff" />
          </Pressable>
        </View>

        {loading ? <ActivityIndicator color="#F97316" style={{ marginTop: 24 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {d ? (
          <View style={styles.card}>
            <Text style={styles.section}>{d.trackingNumber ?? input}</Text>
            <Text style={styles.line}>Status: {d.status ?? "—"}</Text>
            {d.pickupCity || d.deliveryCity ? (
              <Text style={styles.line}>
                {[d.pickupCity, d.deliveryCity].filter(Boolean).join(" → ")}
              </Text>
            ) : null}
            {d.driverFirstName ? (
              <Text style={styles.line}>
                Driver: {d.driverFirstName}
                {d.driverVehicleType ? ` · ${d.driverVehicleType}` : ""}
              </Text>
            ) : null}
            {d.estimatedMinutes != null ? (
              <Text style={styles.muted}>ETA ~{d.estimatedMinutes} min</Text>
            ) : null}
            <Text style={styles.muted}>
              Created: {d.createdAt ? new Date(d.createdAt).toLocaleString() : "—"}
            </Text>
            {d.deliveredAt ? (
              <Text style={styles.muted}>
                Delivered: {new Date(d.deliveredAt).toLocaleString()}
              </Text>
            ) : null}
          </View>
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
    paddingHorizontal: 12,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  hint: { color: "#64748B", fontSize: 13 },
  row: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0F172A",
  },
  searchBtn: {
    width: 48,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  error: { color: "#B91C1C", marginTop: 8 },
  card: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 6,
  },
  section: { fontWeight: "800", fontSize: 16, color: "#0F172A" },
  line: { color: "#334155", fontSize: 14 },
  muted: { color: "#64748B", fontSize: 12 },
});
