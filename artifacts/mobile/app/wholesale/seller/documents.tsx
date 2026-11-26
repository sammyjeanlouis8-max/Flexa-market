import { useLanguage } from "@/context/LanguageContext";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

const CHECKLIST = [
  {
    title: "Business registration",
    meta: "Company papers for seller verification",
    href: "/wholesale/verification",
    done: false,
  },
  {
    title: "Depot lease / ownership",
    meta: "Proof of warehouse control",
    href: "/wholesale/seller/warehouse",
    done: true,
  },
  {
    title: "Invoice #1042",
    meta: "Rice deal · Karibe",
    href: "/wholesale/deals",
    done: true,
  },
  {
    title: "Pickup confirmation form",
    meta: "Optional for chat deals",
    href: "/wholesale/pickup",
    done: false,
  },
];

export default function WholesaleSellerDocumentsScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_documentsTitle")} subtitle={t("wholesale_documentsSubtitle")}>
        <Text style={styles.intro}>Document checklist for chat-only wholesale deals and depot verification.</Text>
        <View style={styles.list}>
          {CHECKLIST.map((item) => (
            <Pressable
              key={item.title}
              style={styles.row}
              onPress={() => router.push(item.href as any)}
            >
              <View style={[styles.check, item.done && styles.checkOn]}>
                <Feather name={item.done ? "check" : "circle"} size={14} color={item.done ? T.white : T.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.meta}>{item.meta}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.done ? "Ready" : "Needed"}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.cta} onPress={() => router.push("/wholesale/verification")}>
          <Text style={styles.ctaText}>Continue verification</Text>
        </Pressable>
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: 14, fontSize: 13, color: T.muted, lineHeight: 18 },
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.mintSoft,
  },
  checkOn: { backgroundColor: T.accent, borderColor: T.accent },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { marginTop: 2, fontSize: 12, color: T.muted },
  badge: {
    backgroundColor: T.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: T.accent, textTransform: "uppercase" },
  cta: {
    marginTop: 16,
    backgroundColor: T.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  ctaText: { color: T.white, fontWeight: "800", fontSize: 13 },
});
