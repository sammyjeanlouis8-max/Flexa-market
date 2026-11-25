import { useLanguage } from "@/context/LanguageContext";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import {
  fetchWarehouses,
  patchWarehouse,
  type WholesaleWarehouse,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function AdminWarehousesScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const [rows, setRows] = useState<WholesaleWarehouse[]>([]);
  const [filter, setFilter] = useState<"pending" | "verified" | "rejected" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchWarehouses(
        {
          admin: true,
          verified: false,
          status: filter === "all" ? undefined : filter,
        },
        { token },
      );
      setRows(list);
    } catch (e: any) {
      setError(e?.message || "Failed to load warehouses");
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const setStatus = async (w: WholesaleWarehouse, verificationStatus: "verified" | "rejected") => {
    if (!token) return;
    if (!user?.isSuperAdmin) {
      Alert.alert("Super Admin only");
      return;
    }
    try {
      await patchWarehouse(
        w.id,
        {
          verificationStatus,
          rejectionReason: verificationStatus === "rejected" ? "Failed verification review" : null,
        },
        { token },
      );
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Update failed");
    }
  };

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_adminDepots")} subtitle="Verify warehouse ownership by country">
        <View style={styles.filters}>
          {(["pending", "verified", "rejected", "all"] as const).map((f) => (
            <Pressable
              key={f}
              style={[styles.chip, filter === f && styles.chipOn]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.chipText, filter === f && styles.chipTextOn]}>{f}</Text>
            </Pressable>
          ))}
        </View>
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No warehouses in this filter.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((w) => (
              <View key={w.id} style={styles.card} testID={`admin-warehouse-${w.id}`}>
                <Text style={styles.title}>{w.name}</Text>
                <Text style={styles.meta}>
                  {w.sellerName || `Seller #${w.sellerId}`} · {w.city}, {w.country}
                </Text>
                {w.address ? <Text style={styles.meta}>{w.address}</Text> : null}
                {w.latitude != null && w.longitude != null ? (
                  <Text style={styles.meta}>
                    GPS {w.latitude.toFixed(4)}, {w.longitude.toFixed(4)}
                  </Text>
                ) : null}
                <Text style={styles.status}>{w.verificationStatus}</Text>
                {w.verificationStatus === "pending" ? (
                  <View style={styles.actions}>
                    <Pressable style={styles.verify} onPress={() => void setStatus(w, "verified")}>
                      <Text style={styles.verifyText}>Verify</Text>
                    </Pressable>
                    <Pressable style={styles.reject} onPress={() => void setStatus(w, "rejected")}>
                      <Text style={styles.rejectText}>Reject</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: T.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  chipOn: { backgroundColor: T.accentSoft, borderColor: T.accent },
  chipText: { fontSize: 12, fontWeight: "800", color: T.muted, textTransform: "capitalize" },
  chipTextOn: { color: T.forest },
  list: { gap: 10 },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontSize: 15, fontWeight: "800", color: T.ink },
  meta: { marginTop: 4, fontSize: 12, color: T.muted },
  status: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "800",
    color: T.accent,
    textTransform: "uppercase",
  },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  verify: {
    flex: 1,
    backgroundColor: T.accent,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  verifyText: { color: T.white, fontWeight: "800" },
  reject: {
    flex: 1,
    backgroundColor: T.mint,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  rejectText: { color: T.danger, fontWeight: "800" },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
