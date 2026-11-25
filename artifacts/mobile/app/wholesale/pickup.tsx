import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchWarehouses, type WholesaleWarehouse } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function DepotPickupScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<WholesaleWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const country = user?.country || "";

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (!country) {
        setError("Set your profile country to see pickup depots.");
        setRows([]);
        return;
      }
      const list = await fetchWarehouses({ verified: true, country, limit: 50 }, { token });
      setRows(list);
    } catch (e: any) {
      setError(e?.message || "Failed to load depots");
    } finally {
      setLoading(false);
    }
  }, [token, country]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openMaps = (w: WholesaleWarehouse) => {
    if (w.latitude != null && w.longitude != null) {
      void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${w.latitude},${w.longitude}`);
      return;
    }
    const q = encodeURIComponent(`${w.address || w.name}, ${w.city}, ${w.country}`);
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };

  return (
    <WholesaleGate>
      <WholesaleShell title="Depot pickup" subtitle={`Verified warehouses in ${country || "your country"}`}>
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No verified pickup depots in your country yet.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((w) => (
              <View key={w.id} style={styles.card}>
                <Pressable onPress={() => router.push(`/wholesale/stores/${w.sellerId}`)}>
                  <Text style={styles.title}>{w.name}</Text>
                </Pressable>
                <Text style={styles.meta}>{w.address || "Address on request"}</Text>
                <Text style={styles.meta}>{w.city}, {w.country}</Text>
                <Pressable onPress={() => openMaps(w)}>
                  <Text style={styles.link}>Open directions</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  card: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    gap: 4,
  },
  title: { fontSize: 15, fontWeight: "800", color: T.ink },
  meta: { fontSize: 12, color: T.muted },
  link: { marginTop: 6, color: T.accent, fontWeight: "700" },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
