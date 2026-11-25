import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import {
  fetchSellerDocuments,
  fetchSellerProfile,
  fetchWarehouses,
  type WholesaleSellerProfile,
  type WholesaleWarehouse,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function SellerVerificationScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<WholesaleSellerProfile | null>(null);
  const [warehouses, setWarehouses] = useState<WholesaleWarehouse[]>([]);
  const [docs, setDocs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [p, wh, documents] = await Promise.all([
        fetchSellerProfile({ token }),
        fetchWarehouses({ mine: true, limit: 50 }, { token }),
        fetchSellerDocuments({ token }),
      ]);
      setProfile(p);
      setWarehouses(wh);
      setDocs(documents.length);
    } catch (e: any) {
      setError(e?.message || "Failed to load verification status");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const verifiedCount = warehouses.filter((w) => w.verificationStatus === "verified").length;
  const pendingCount = warehouses.filter((w) => w.verificationStatus === "pending").length;

  return (
    <WholesaleGate>
      <WholesaleShell title="Seller verification" subtitle="Warehouse + document review for Flexa Wholesale">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <View style={styles.list}>
            <View style={styles.card}>
              <Text style={styles.label}>Seller status</Text>
              <Text style={styles.value}>{profile?.verificationStatus || "unverified"}</Text>
              <Text style={styles.meta}>Plan: {profile?.plan || "free"}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>Warehouses</Text>
              <Text style={styles.value}>{verifiedCount} verified · {pendingCount} pending</Text>
              <Pressable onPress={() => router.push("/wholesale/seller/warehouse")}>
                <Text style={styles.link}>Manage warehouses</Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>Documents</Text>
              <Text style={styles.value}>{docs} submitted</Text>
              <Pressable onPress={() => router.push("/wholesale/seller/documents")}>
                <Text style={styles.link}>Upload documents</Text>
              </Pressable>
            </View>
            {warehouses.map((w) => (
              <View key={w.id} style={styles.row}>
                <Text style={styles.title}>{w.name}</Text>
                <Text style={styles.meta}>{w.city}, {w.country} · {w.verificationStatus}</Text>
                {w.rejectionReason ? <Text style={styles.error}>{w.rejectionReason}</Text> : null}
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
  label: { fontSize: 11, fontWeight: "800", color: T.muted, textTransform: "uppercase" },
  value: { fontSize: 18, fontWeight: "800", color: T.ink },
  row: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { fontSize: 12, color: T.muted },
  link: { marginTop: 6, color: T.accent, fontWeight: "700" },
  error: { color: T.danger, fontWeight: "700" },
});
