import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchAdminReports } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function AdminReportsScreen() {
  const { token } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchAdminReports>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAdminReports({ token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <WholesaleGate>
      <WholesaleShell title="Reports" subtitle="Super Admin · dispute overview">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : !data ? null : (
          <View style={styles.wrap}>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.label}>Open disputes</Text>
                <Text style={styles.value}>{data.overview.openDisputes}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.label}>Total disputes</Text>
                <Text style={styles.value}>{data.overview.totalDisputes}</Text>
              </View>
            </View>
            <View style={styles.list}>
              {data.disputes.map((d) => (
                <View key={d.id} style={styles.row}>
                  <Text style={styles.title}>#{d.id} · {d.status}</Text>
                  <Text style={styles.meta}>{d.reason}</Text>
                </View>
              ))}
              {data.disputes.length === 0 ? <Text style={styles.empty}>No dispute reports.</Text> : null}
            </View>
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  stats: { flexDirection: "row", gap: 10 },
  stat: {
    flex: 1,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  label: { fontSize: 11, fontWeight: "800", color: T.muted, textTransform: "uppercase" },
  value: { marginTop: 4, fontSize: 22, fontWeight: "800", color: T.accent },
  list: { gap: 8 },
  row: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { marginTop: 2, fontSize: 12, color: T.muted },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
