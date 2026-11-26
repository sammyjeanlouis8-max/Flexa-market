import { useLanguage } from "@/context/LanguageContext";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchInquiries } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

type InquiryRow = Awaited<ReturnType<typeof fetchInquiries>>[number];

export default function WholesaleInquiryDetailScreen() {
  const { t } = useLanguage();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const inquiryId = Number(idParam);
  const { token } = useAuth();
  const router = useRouter();
  const [inquiry, setInquiry] = useState<InquiryRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !Number.isSafeInteger(inquiryId) || inquiryId <= 0) {
      setLoading(false);
      setError("Invalid inquiry");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [buyer, seller] = await Promise.all([
        fetchInquiries("buyer", { token }).catch(() => [] as InquiryRow[]),
        fetchInquiries("seller", { token }).catch(() => [] as InquiryRow[]),
      ]);
      const found =
        buyer.find((r) => r.id === inquiryId) ||
        seller.find((r) => r.id === inquiryId) ||
        null;
      setInquiry(found);
      if (!found) setError("Inquiry not found");
    } catch (e: any) {
      setError(e?.message || t("wholesale_failedLoad"));
      setInquiry(null);
    } finally {
      setLoading(false);
    }
  }, [token, inquiryId, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openChat = () => {
    if (!inquiry) return;
    if (inquiry.conversationId) {
      router.push(`/chat/${inquiry.conversationId}`);
      return;
    }
    if (inquiry.productId) {
      router.push(`/wholesale/products/${inquiry.productId}`);
      return;
    }
  };

  return (
    <WholesaleGate>
      <WholesaleShell
        title={t("wholesale_inquiryTitle")}
        subtitle={t("wholesale_inquirySubtitle")}
      >
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Flow</Text>
            <Text style={styles.statValue}>Chat</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Checkout</Text>
            <Text style={styles.statValue}>—</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error && !inquiry ? (
          <Text style={styles.error}>{error}</Text>
        ) : inquiry ? (
          <View style={styles.card}>
            <Text style={styles.label}>Product</Text>
            <Text style={styles.value}>
              {inquiry.productTitle || (inquiry.productId ? `#${inquiry.productId}` : "—")}
            </Text>

            <Text style={styles.label}>Quantity</Text>
            <Text style={styles.value}>{inquiry.qty}</Text>

            <Text style={styles.label}>Status</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{inquiry.status}</Text>
            </View>

            <Text style={styles.label}>Message</Text>
            <Text style={styles.message}>
              {inquiry.message?.trim() || "No message attached."}
            </Text>

            <Text style={styles.meta}>
              Created {new Date(inquiry.createdAt).toLocaleString()}
            </Text>

            <Pressable
              style={styles.cta}
              onPress={openChat}
              testID="wholesale-inquiry-open-chat"
            >
              <Text style={styles.ctaText}>
                {inquiry.conversationId ? "Open chat" : "Open product & chat"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.error}>{t("wholesale_failedLoad")}</Text>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  stat: {
    flexGrow: 1,
    minWidth: "45%",
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: T.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statValue: { marginTop: 4, fontSize: 22, fontWeight: "800", color: T.accent },
  card: {
    backgroundColor: T.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  label: {
    marginTop: 12,
    fontSize: 11,
    fontWeight: "800",
    color: T.muted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  value: { marginTop: 4, fontSize: 16, fontWeight: "700", color: T.ink },
  message: { marginTop: 4, fontSize: 14, color: T.ink, lineHeight: 20 },
  meta: { marginTop: 14, fontSize: 12, color: T.muted },
  badge: {
    marginTop: 6,
    alignSelf: "flex-start",
    backgroundColor: T.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: T.accent,
    textTransform: "uppercase",
  },
  cta: {
    marginTop: 20,
    height: 44,
    borderRadius: 12,
    backgroundColor: T.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: T.white, fontWeight: "800", fontSize: 15 },
  error: { color: T.danger, fontWeight: "700" },
});
