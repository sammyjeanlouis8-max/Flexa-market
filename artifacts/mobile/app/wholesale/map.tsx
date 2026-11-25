import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchWarehouses, type WholesaleWarehouse } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleMapScreen() {
  const { token, user } = useAuth();
  const [rows, setRows] = useState<WholesaleWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const country = user?.country;
      if (!country) {
        setError("Set your profile country to see warehouses on the map.");
        setRows([]);
        return;
      }
      const list = await fetchWarehouses({ verified: true, country, limit: 50 }, { token });
      setRows(list.filter((w) => w.latitude != null && w.longitude != null));
    } catch (e: any) {
      setError(e?.message || "Failed to load map depots");
    } finally {
      setLoading(false);
    }
  }, [token, user?.country]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openMaps = (w: WholesaleWarehouse) => {
    if (w.latitude == null || w.longitude == null) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${w.latitude},${w.longitude}`;
    void Linking.openURL(url);
  };

  return (
    <WholesaleGate>
      <WholesaleShell title="Warehouse map" subtitle="Verified depots with GPS coordinates">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>
            No GPS-tagged verified warehouses yet. Sellers can add coordinates manually or via GPS.
          </Text>
        ) : (
          <View style={styles.list}>
            {rows.map((w) => (
              <Pressable key={w.id} style={styles.card} onPress={() => openMaps(w)}>
                <Text style={styles.title}>{w.name}</Text>
                <Text style={styles.meta}>
                  {w.city}, {w.country}
                </Text>
                <Text style={styles.coords}>
                  {w.latitude!.toFixed(5)}, {w.longitude!.toFixed(5)} · Open in Maps
                </Text>
              </Pressable>
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
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontSize: 15, fontWeight: "800", color: T.ink },
  meta: { marginTop: 4, fontSize: 13, color: T.muted },
  coords: { marginTop: 8, fontSize: 12, fontWeight: "700", color: T.accent },
  empty: { color: T.muted, lineHeight: 20 },
  error: { color: T.danger, fontWeight: "700" },
});
