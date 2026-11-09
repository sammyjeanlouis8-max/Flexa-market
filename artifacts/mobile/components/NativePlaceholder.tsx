/**
 * Temporary native stand-in for marketplace screens not yet migrated.
 * Intentionally NOT a WebView — keeps the Android app Play-policy clean
 * while progressive migration continues.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";

type Props = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
};

export default function NativePlaceholder({
  title,
  subtitle = "This screen is being rebuilt as native React Native. The Flexa Market website still has the full experience while we migrate.",
  showBack = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const c = colors.light;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, backgroundColor: c.background }]}>
      {showBack ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={22} color={c.foreground} />
        </Pressable>
      ) : (
        <View style={{ height: 40 }} />
      )}
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Feather name="smartphone" size={32} color="#F97316" />
        </View>
        <Text style={[styles.title, { color: c.foreground }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: c.mutedForeground }]}>{subtitle}</Text>
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
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 80,
    gap: 12,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#FFF7ED",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 320,
  },
});
