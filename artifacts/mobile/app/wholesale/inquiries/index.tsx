import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchInquiries } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function BuyerInquiriesScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchInquiries>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchInquiries("buyer", { token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load inquiries");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <WholesaleGate>
      <WholesaleShell title="My inquiries" subtitle="From Flexa Wholesale · chat with sellers">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No inquiries yet — open a product and chat the seller.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((r) => (
              <Pressable
                key={r.id}
                style={styles.row}
                onPress={() => {
                  if (r.conversationId) router.push(`/chat/${r.conversationId}`);
                  else if (r.productId) router.push(`/wholesale/products/${r.productId}`);
                }}
              >
                <Text style={styles.title}>{r.productTitle || "Wholesale inquiry"}</Text>
                <Text style={styles.meta}>
                  Qty {r.qty} · {r.status}
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
