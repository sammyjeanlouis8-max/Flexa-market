import { useLanguage } from "@/context/LanguageContext";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleQuoteDetailScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const quoteId = useMemo(() => {
    const raw = Array.isArray(params.id) ? params.id[0] : params.id;
    return raw || "—";
  }, [params.id]);

  return (
    <WholesaleGate>
      <WholesaleShell
        title={`${t("wholesale_quoteTitle")} #${quoteId}`}
        subtitle={t("wholesale_quoteSubtitle")}
      >
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t("wholesale_qty")}</Text>
            <Text style={styles.statValue}>40</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t("wholesale_quote")}</Text>
            <Text style={styles.statValue}>$1,040</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Quote summary</Text>
          <Text style={styles.body}>
            Placeholder summary for quote {quoteId}. Finalize qty, price, and depot pickup in chat — Flexa Wholesale has no checkout cart.
          </Text>
        </View>

        <View style={styles.list}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Buyer</Text>
              <Text style={styles.rowMeta}>Hotel Karibe · Haiti</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Open</Text>
            </View>
          </View>
          <Pressable style={styles.row} onPress={() => router.push("/wholesale/stores/1")}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Depot</Text>
              <Text style={styles.rowMeta}>Flexa Delmas Depot</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Pickup</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.ctas}>
          <Pressable style={styles.primary} onPress={() => router.push("/wholesale/inquiries")}>
            <Text style={styles.primaryText}>Continue in chat</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => router.push("/wholesale/deals")}>
            <Text style={styles.secondaryText}>View deals</Text>
          </Pressable>
        </View>
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
  statValue: { marginTop: 4, fontSize: 24, fontWeight: "800", color: T.accent },
  card: {
    backgroundColor: T.mint,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  label: { fontSize: 12, fontWeight: "800", color: T.forest, textTransform: "uppercase" },
  body: { marginTop: 6, fontSize: 13, color: T.muted, lineHeight: 18 },
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
  rowTitle: { fontSize: 14, fontWeight: "700", color: T.ink },
  rowMeta: { marginTop: 2, fontSize: 12, color: T.muted },
  badge: {
    backgroundColor: T.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: T.accent, textTransform: "uppercase" },
  ctas: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  primary: {
    backgroundColor: T.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryText: { color: T.white, fontWeight: "800", fontSize: 13 },
  secondary: {
    backgroundColor: T.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  secondaryText: { color: T.ink, fontWeight: "800", fontSize: 13 },
});
