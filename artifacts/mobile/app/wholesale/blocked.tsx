import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchBlocks, unblockSeller } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

type Row = Awaited<ReturnType<typeof fetchBlocks>>[number];

export default function BlockedSellersScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchBlocks({ token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load blocked sellers");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onUnblock = async (blockedId: number) => {
    if (!token) return;
    await unblockSeller(blockedId, { token });
    await load();
  };

  return (
    <WholesaleGate>
      <WholesaleShell title="Blocked sellers" subtitle="Sellers you have blocked in Flexa Wholesale">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No blocked sellers.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((r) => (
              <View key={r.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{r.blockedName || `User #${r.blockedId}`}</Text>
                  <Text style={styles.meta}>{r.reason || "No reason listed"}</Text>
                </View>
                <Pressable onPress={() => void onUnblock(r.blockedId)}>
                  <Text style={styles.unblock}>Unblock</Text>
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
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { marginTop: 2, fontSize: 12, color: T.muted },
  unblock: { color: T.accent, fontWeight: "800" },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
