import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchInquiry, formatMoney, patchInquiry, type WholesaleInquiryDetail } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function InquiryDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const inquiryId = Number(id);
  const { token, user } = useAuth();
  const router = useRouter();
  const [inquiry, setInquiry] = useState<WholesaleInquiryDetail | null>(null);
  const [quote, setQuote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(inquiryId)) return;
    setLoading(true);
    setError(null);
    try {
      const row = await fetchInquiry(inquiryId, { token });
      setInquiry(row);
      if (row.quotedUnitPrice != null) setQuote(String(row.quotedUnitPrice));
    } catch (e: any) {
      setError(e?.message || "Failed to load inquiry");
    } finally {
      setLoading(false);
    }
  }, [token, inquiryId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const isSeller = inquiry && user?.id === inquiry.sellerId;

  const onQuote = async () => {
    if (!token || !inquiry) return;
    const price = Number(quote);
    if (!Number.isFinite(price) || price <= 0) {
      setError("Enter a valid quote price");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await patchInquiry(inquiry.id, { quotedUnitPrice: price, status: "quoted" }, { token });
      setInquiry({ ...inquiry, ...updated });
    } catch (e: any) {
      setError(e?.message || "Quote failed");
    } finally {
      setSaving(false);
    }
  };

  const onClose = async () => {
    if (!token || !inquiry) return;
    setSaving(true);
    try {
      const updated = await patchInquiry(inquiry.id, { status: "closed" }, { token });
      setInquiry({ ...inquiry, ...updated });
    } catch (e: any) {
      setError(e?.message || "Could not close");
    } finally {
      setSaving(false);
    }
  };

  return (
    <WholesaleGate>
      <WholesaleShell title={`Inquiry #${inquiryId}`} subtitle="Chat-only wholesale negotiation">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error && !inquiry ? (
          <Text style={styles.error}>{error}</Text>
        ) : !inquiry ? (
          <Text style={styles.empty}>Inquiry not found.</Text>
        ) : (
          <View style={styles.card}>
            <Text style={styles.title}>{inquiry.product?.title || "Product"}</Text>
            <Text style={styles.meta}>Qty {inquiry.qty} · Status {inquiry.status}</Text>
            <Text style={styles.meta}>Buyer: {inquiry.buyer?.name || inquiry.buyerId}</Text>
            <Text style={styles.meta}>Seller: {inquiry.seller?.name || inquiry.sellerId}</Text>
            {inquiry.quotedUnitPrice != null ? (
              <Text style={styles.quote}>
                Quote {formatMoney(inquiry.quotedUnitPrice)} × {inquiry.qty} ={" "}
                {formatMoney(inquiry.quotedUnitPrice * inquiry.qty)}
              </Text>
            ) : null}
            <Text style={styles.body}>{inquiry.message}</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {isSeller && inquiry.status !== "closed" ? (
              <View style={styles.row}>
                <TextInput
                  value={quote}
                  onChangeText={setQuote}
                  keyboardType="decimal-pad"
                  placeholder="Quoted unit price"
                  placeholderTextColor={T.muted}
                  style={styles.input}
                />
                <Pressable style={styles.btn} onPress={() => void onQuote()} disabled={saving}>
                  <Text style={styles.btnText}>Send quote</Text>
                </Pressable>
              </View>
            ) : null}
            {inquiry.status !== "closed" ? (
              <Pressable style={[styles.btn, styles.secondary]} onPress={() => void onClose()} disabled={saving}>
                <Text style={[styles.btnText, { color: T.accent }]}>Mark closed</Text>
              </Pressable>
            ) : null}
            {inquiry.conversationId ? (
              <Pressable style={styles.link} onPress={() => router.push(`/chat/${inquiry.conversationId}`)}>
                <Text style={styles.linkText}>Open chat</Text>
              </Pressable>
            ) : null}
            {inquiry.productId ? (
              <Pressable style={styles.link} onPress={() => router.push(`/wholesale/products/${inquiry.productId}`)}>
                <Text style={styles.linkText}>View product</Text>
              </Pressable>
            ) : null}
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
  quote: { fontSize: 14, fontWeight: "700", color: T.accent },
  body: { fontSize: 14, color: T.ink, lineHeight: 20 },
  row: { flexDirection: "row", gap: 8, marginTop: 8 },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: T.ink,
  },
  btn: {
    backgroundColor: T.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondary: { backgroundColor: T.accentSoft, marginTop: 8 },
  btnText: { color: T.white, fontWeight: "800" },
  link: { marginTop: 4 },
  linkText: { color: T.accent, fontWeight: "700" },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
