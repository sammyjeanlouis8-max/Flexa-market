import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

const CATEGORIES = [
  { title: "Food & Grocery", meta: "48 listings", slug: "food-grocery" },
  { title: "Construction", meta: "31 listings", slug: "construction" },
  { title: "Beverages", meta: "22 listings", slug: "beverages" },
  { title: "Household", meta: "18 listings", slug: "household" },
  { title: "Electronics", meta: "14 listings", slug: "electronics" },
  { title: "Apparel", meta: "9 listings", slug: "apparel" },
];

export default function WholesaleAdminCategoriesScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_adminCategories")} subtitle={t("wholesale_adminSubtitle")}>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t("wholesale_categoriesTitle")}</Text>
            <Text style={styles.statValue}>{CATEGORIES.length}</Text>
          </View>
        </View>
        <View style={styles.list}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.slug}
              style={styles.row}
              onPress={() => router.push(`/wholesale/categories/${encodeURIComponent(c.title)}` as any)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{c.title}</Text>
                <Text style={styles.meta}>{c.meta}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Edit</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>
          Taxonomy preview — chat-only catalog categories. Editing persists when admin APIs ship.
        </Text>
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
  badge: {
    backgroundColor: T.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: T.accent, textTransform: "uppercase" },
  hint: { marginTop: 14, fontSize: 12, color: T.muted, lineHeight: 17 },
});
