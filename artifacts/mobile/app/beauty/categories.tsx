import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BeautyCategoryTile } from "@/components/beauty/BeautyCategoryTile";
import { BeautyShell } from "@/components/beauty/BeautyShell";
import { useLanguage } from "@/context/LanguageContext";
import { BEAUTY_PRIMARY_CATEGORIES } from "@/lib/beautyCategoriesCatalog";
import { beautyTheme as T } from "@/lib/beautyTheme";

export default function BeautyCategoriesScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <BeautyShell
      title={t("beauty_allCategoriesTitle") || "All Beauty Categories"}
      subtitle={t("beauty_allCategoriesSubtitle") || "Explore all beauty and wellness services."}
      scroll={false}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={styles.hero}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.heroTitle}>
              {t("beauty_allCategoriesTitle") || "All Beauty Categories"}
            </Text>
            <Text style={styles.heroSub}>
              {t("beauty_allCategoriesSubtitle") || "Explore all beauty and wellness services."}
            </Text>
          </View>
          <Image
            source={{
              uri: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=400&q=80",
            }}
            style={styles.heroImg}
          />
        </View>

        <View style={styles.grid}>
          {BEAUTY_PRIMARY_CATEGORIES.map((c) => (
            <BeautyCategoryTile
              key={c.slug}
              href={c.href}
              labelKey={c.labelKey}
              photo={c.photo}
              glyph={c.glyph}
              testID={`beauty-all-cat-${c.slug}`}
            />
          ))}
        </View>

        <Pressable style={styles.back} onPress={() => router.push("/beauty" as any)}>
          <Text style={styles.backText}>{t("beauty_backHome") || "Back to Séduire Beauty"}</Text>
        </Pressable>
      </ScrollView>
    </BeautyShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: T.roseDark,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    overflow: "hidden",
  },
  heroTitle: { color: T.white, fontSize: 18, fontWeight: "900" },
  heroSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 4, lineHeight: 16 },
  heroImg: { width: 72, height: 72, borderRadius: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  back: { marginTop: 18, alignItems: "center", paddingVertical: 10 },
  backText: { color: T.accent, fontWeight: "800", fontSize: 13 },
});
