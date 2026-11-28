import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/context/LanguageContext";
import { beautyTheme as T } from "@/lib/beautyTheme";

export function BeautyCategoryTile({
  href,
  labelKey,
  photo,
  glyph,
  testID,
}: {
  href: string;
  labelKey: string;
  photo: string;
  glyph?: string;
  testID?: string;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(href as any)}
      testID={testID}
      accessibilityRole="button"
    >
      <Image source={{ uri: photo }} style={styles.img} resizeMode="cover" />
      <View style={styles.fade} />
      <View style={styles.pill}>
        {glyph ? <Text style={styles.glyph}>{glyph}</Text> : null}
        <Text style={styles.label} numberOfLines={1}>
          {t(labelKey) || labelKey}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "46%",
    maxWidth: "48%",
    aspectRatio: 5 / 4,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(139,69,87,0.08)",
  },
  img: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "34%",
    backgroundColor: "transparent",
    // soft bottom read without heavy dark overlay
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  pill: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  glyph: { fontSize: 11 },
  label: {
    fontSize: 11,
    fontWeight: "800",
    color: T.roseDark,
    flexShrink: 1,
  },
});
