/**
 * Native stand-in for the legacy "Website" drawer entry.
 * The app no longer embeds flexamarket.com in a WebView.
 */
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";

export default function WebsiteScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const c = colors.light;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, backgroundColor: c.background }]}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Feather name="arrow-left" size={22} color={c.foreground} />
      </Pressable>

      <View style={styles.body}>
        <LinearGradient
          colors={["#146C43", "#0F5434"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>FM</Text>
          </View>
          <Text style={styles.brand}>Flexa Market</Text>
          <Text style={styles.heroSub}>Native app experience</Text>
        </LinearGradient>

        <Text style={[styles.title, { color: c.foreground }]}>Sit web la pa embed ankò</Text>
        <Text style={[styles.subtitle, { color: c.mutedForeground }]}>
          Tout navigasyon marketplace a se nativ kounye a. Itilize Home pou browse lisaj yo — menm
          aparans ak flexamarket.com, san WebView.
        </Text>

        <Pressable
          style={styles.cta}
          onPress={() => router.replace("/")}
          accessibilityRole="button"
        >
          <Feather name="home" size={18} color="#fff" />
          <Text style={styles.ctaText}>Ale nan Home</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  body: { flex: 1, paddingTop: 24, gap: 14 },
  hero: {
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { color: "#fff", fontWeight: "900", fontSize: 20 },
  brand: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  heroSub: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600" },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  cta: {
    marginTop: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#146C43",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
