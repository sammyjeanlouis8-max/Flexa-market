import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchInquiry, formatMoney, type WholesaleInquiryDetail } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function QuoteDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const inquiryId = Number(id);
  const { token } = useAuth();
  const router = useRouter();
  const [inquiry, setInquiry] = useState<WholesaleInquiryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(inquiryId)) return;
    setLoading(true);
    setError(null);
    try {
      setInquiry(await fetchInquiry(inquiryId, { token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load quote");
    } finally {
      setLoading(false);
    }
  }, [token, inquiryId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const quoted = inquiry?.quotedUnitPrice;
  const total = quoted != null && inquiry ? quoted * inquiry.qty : null;

  return (
    <WholesaleGate>
      <WholesaleShell title="Quote details" subtitle="Seller unit price for this inquiry">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : !inquiry ? (
          <Text style={styles.empty}>Quote not found.</Text>
        ) : (
          <View style={styles.card}>
            <Text style={styles.title}>{inquiry.product?.title || `Inquiry #${inquiry.id}`}</Text>
            <Text style={styles.meta}>Status: {inquiry.status}</Text>
            <Text style={styles.meta}>Quantity: {inquiry.qty}</Text>
            {quoted != null ? (
              <>
                <Text style={styles.price}>Unit quote: {formatMoney(quoted)}</Text>
                <Text style={styles.price}>Estimated total: {formatMoney(total!)}</Text>
              </>
            ) : (
              <Text style={styles.empty}>Seller has not quoted yet.</Text>
            )}
            <Pressable style={styles.link} onPress={() => router.push(`/wholesale/inquiries/${inquiry.id}`)}>
              <Text style={styles.linkText}>Open inquiry</Text>
            </Pressable>
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: "800", color: T.ink },
  meta: { fontSize: 13, color: T.muted },
  price: { fontSize: 15, fontWeight: "700", color: T.accent },
  link: { marginTop: 8 },
  linkText: { color: T.accent, fontWeight: "700" },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
