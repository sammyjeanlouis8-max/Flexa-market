import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  title: string;
  detail?: string;
  showBack?: boolean;
};

/**
 * Temporary native stand-in while a feature is migrated off WebView.
 * Must never fall back to an in-app WebView of flexamarket.com.
 */
export function NativePlaceholder({
  title,
  detail = "This screen is being rebuilt with native React Native components for Google Play compliance. The website and backend remain available separately.",
  showBack = true,
}: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.wrap}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            style={styles.back}
          >
            <Feather name="arrow-left" size={20} color="#F8FAFC" />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : null}
        <View style={styles.iconWrap}>
          <Feather name="smartphone" size={28} color="#F97316" />
        </View>
        <Text style={styles.brand}>Flexa Market</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  wrap: { flex: 1, paddingHorizontal: 24, paddingTop: 12, gap: 12 },
  back: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  backText: { color: "#F8FAFC", fontSize: 15, fontWeight: "600" },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  brand: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#F8FAFC",
  },
  title: { fontSize: 18, fontWeight: "700", color: "#F97316" },
  detail: { fontSize: 14, lineHeight: 21, color: "#94A3B8", maxWidth: 360 },
});
