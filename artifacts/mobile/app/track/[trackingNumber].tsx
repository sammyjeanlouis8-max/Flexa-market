import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { getApiBase } from "@/lib/api";

export default function PublicTrackScreen() {
  const { trackingNumber } = useLocalSearchParams<{ trackingNumber: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const code = encodeURIComponent(String(trackingNumber || ""));
        const res = await fetch(`${getApiBase()}/track/${code}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Tracking failed (${res.status})`);
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Tracking failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackingNumber]);

  return (
    <View style={styles.root}>
      <AppHeader title="Tracking" showBrand={false} showBack showMenu={false} />
      <View style={styles.body}>
        <Text style={styles.code}>{trackingNumber}</Text>
        {loading ? (
          <ActivityIndicator color={colors.flexaGreen} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <>
            <Text style={styles.status}>
              Status: {data?.status || data?.deliveryStatus || data?.state || "Unknown"}
            </Text>
            {data?.carrier ? <Text style={styles.meta}>Carrier: {String(data.carrier)}</Text> : null}
            {data?.eta ? <Text style={styles.meta}>ETA: {String(data.eta)}</Text> : null}
            {data?.lastUpdate ? (
              <Text style={styles.meta}>Updated: {String(data.lastUpdate)}</Text>
            ) : null}
            <Text style={styles.hint} onPress={() => router.push("/delivery-tracking")}>
              Signed-in delivery details
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  body: { padding: 20, gap: 10 },
  code: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  status: { fontSize: 16, fontWeight: "700", color: colors.flexaGreen },
  meta: { fontSize: 14, color: "#475569" },
  error: { color: "#B91C1C" },
  hint: { marginTop: 16, color: colors.flexaOrange, fontWeight: "700" },
});
