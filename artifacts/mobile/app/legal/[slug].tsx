/**
 * Legal documents — static content for privacy, terms, eula, etc.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { resolveLegalSlug } from "@/constants/legalContent";

export default function LegalSlugScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const doc = resolveLegalSlug(Array.isArray(slug) ? slug[0] : slug);

  if (!doc) {
    return (
      <View style={styles.root}>
        <AppHeader title="Legal" showBack showCart={false} />
        <View style={styles.center}>
          <Text style={styles.missing}>Document not found</Text>
          <Text style={styles.sub}>
            Try privacy, terms, eula, cookies, or community-guidelines.
          </Text>
          <Pressable style={styles.cta} onPress={() => router.push("/help-center")}>
            <Text style={styles.ctaText}>Help Center</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader title={doc.title} showBack showCart={false} showBell={false} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.effective}>Effective {doc.effectiveDate}</Text>
        {doc.sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <Text style={styles.heading}>{s.heading}</Text>
            {s.body.map((p, i) => (
              <Text key={i} style={styles.p}>
                {p}
              </Text>
            ))}
          </View>
        ))}
        <Pressable style={styles.link} onPress={() => router.push("/support")}>
          <Text style={styles.linkText}>Contact support</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  missing: { fontSize: 17, fontWeight: "800", color: colors.light.text },
  sub: { marginTop: 8, textAlign: "center", color: "#64748B", marginBottom: 16 },
  cta: {
    backgroundColor: colors.flexaGreen,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: "#fff", fontWeight: "800" },
  effective: { fontSize: 12, color: "#94A3B8", marginBottom: 16 },
  section: { marginBottom: 20 },
  heading: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.light.text,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.flexaGreen,
    paddingLeft: 10,
  },
  p: { fontSize: 14, lineHeight: 22, color: "#475569", marginBottom: 8 },
  link: { marginTop: 8, alignSelf: "flex-start" },
  linkText: { color: colors.flexaGreen, fontWeight: "800" },
});
