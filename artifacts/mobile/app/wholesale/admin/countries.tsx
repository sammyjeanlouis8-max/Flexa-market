import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchAdminCountries } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function AdminCountriesScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchAdminCountries>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchAdminCountries({ token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load countries");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <WholesaleGate>
      <WholesaleShell title="Countries" subtitle="Super Admin · products and verified depots by country">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No country activity yet.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((r) => (
              <View key={r.country} style={styles.row}>
                <Text style={styles.title}>{r.country}</Text>
                <Text style={styles.meta}>
                  {r.products} products · {r.verified}/{r.warehouses} warehouses verified
                </Text>
              </View>
            ))}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
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
