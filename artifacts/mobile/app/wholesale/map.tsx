import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchWarehouses, type WholesaleWarehouse } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

/** Native depot map surface — GPS list + system Maps deep links (no WebView). */
export default function WholesaleMapScreen() {
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
        setError("Set your profile country to see warehouses on the map.");
        setRows([]);
        return;
      }
      const list = await fetchWarehouses({ verified: true, country, limit: 100 }, { token });
      setRows(list);
    } catch (e: any) {
      setError(e?.message || "Failed to load map depots");
    } finally {
      setLoading(false);
    }
  }, [token, country]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const withGps = useMemo(
    () => rows.filter((w) => w.latitude != null && w.longitude != null),
    [rows],
  );
  const withoutGps = useMemo(
    () => rows.filter((w) => w.latitude == null || w.longitude == null),
    [rows],
  );

  const bounds = useMemo(() => {
    if (withGps.length === 0) return null;
    const lats = withGps.map((w) => w.latitude!);
    const lngs = withGps.map((w) => w.longitude!);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }, [withGps]);

  const openMaps = (w: WholesaleWarehouse) => {
    if (w.latitude != null && w.longitude != null) {
      void Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${w.latitude},${w.longitude}`,
      );
      return;
    }
    const q = encodeURIComponent(`${w.address || w.name}, ${w.city}, ${w.country}`);
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };

  const openAll = () => {
    if (!bounds) return;
    const midLat = (bounds.minLat + bounds.maxLat) / 2;
    const midLng = (bounds.minLng + bounds.maxLng) / 2;
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${midLat},${midLng}`);
  };

  return (
    <WholesaleGate>
      <WholesaleShell
        title="Warehouse map"
        subtitle={`Native depot map · ${country || "your country"}`}
        scroll
      >
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>
            No verified warehouses in {country || "your country"} yet.
          </Text>
        ) : (
          <View style={styles.wrap}>
            <View style={styles.mapPlane} testID="wholesale-native-map">
              <Text style={styles.mapTitle}>Depot coverage</Text>
              <Text style={styles.mapMeta}>
                {withGps.length} GPS pins · {withoutGps.length} address-only
              </Text>
              {bounds ? (
                <>
                  <View style={styles.plot}>
                    {withGps.map((w) => {
                      const left =
                        bounds.maxLng === bounds.minLng
                          ? 50
                          : ((w.longitude! - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
                      const top =
                        bounds.maxLat === bounds.minLat
                          ? 50
                          : ((bounds.maxLat - w.latitude!) / (bounds.maxLat - bounds.minLat)) * 100;
                      return (
                        <Pressable
                          key={w.id}
                          style={[styles.pin, { left: `${Math.min(94, Math.max(2, left))}%`, top: `${Math.min(88, Math.max(4, top))}%` }]}
                          onPress={() => openMaps(w)}
                        />
                      );
                    })}
                  </View>
                  <Pressable style={styles.openAll} onPress={openAll}>
                    <Text style={styles.openAllText}>Open region in Maps</Text>
                  </Pressable>
                </>
              ) : (
                <Text style={styles.mapMeta}>Add GPS on warehouses to plot pins here.</Text>
              )}
            </View>
            <View style={styles.list}>
              {rows.map((w) => (
                <Pressable key={w.id} style={styles.card} onPress={() => openMaps(w)}>
                  <Text style={styles.title}>{w.name}</Text>
                  <Text style={styles.meta}>
                    {w.city}, {w.country}
                  </Text>
                  <Text style={styles.coords}>
                    {w.latitude != null && w.longitude != null
                      ? `${w.latitude.toFixed(5)}, ${w.longitude.toFixed(5)} · Open in Maps`
                      : "Address directions · Open in Maps"}
                  </Text>
                  <Pressable onPress={() => router.push(`/wholesale/stores/${w.sellerId}`)}>
                    <Text style={styles.link}>View store</Text>
                  </Pressable>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  mapPlane: {
    backgroundColor: T.forest,
    borderRadius: 16,
    padding: 14,
    minHeight: 200,
    overflow: "hidden",
  },
  mapTitle: { color: T.white, fontWeight: "800", fontSize: 16 },
  mapMeta: { color: "rgba(255,255,255,0.75)", marginTop: 4, fontSize: 12 },
  plot: {
    marginTop: 12,
    height: 140,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    position: "relative",
  },
  pin: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: T.accent,
    borderWidth: 2,
    borderColor: T.white,
    marginLeft: -6,
    marginTop: -6,
  },
  openAll: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: T.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  openAllText: { color: T.forest, fontWeight: "800", fontSize: 12 },
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
  meta: { fontSize: 13, color: T.muted },
  coords: { fontSize: 12, color: T.accent, fontWeight: "600" },
  link: { marginTop: 4, color: T.accent, fontWeight: "700" },
  empty: { color: T.muted, fontSize: 14 },
  error: { color: T.danger, fontWeight: "700" },
});
