/**
 * Compatibility deep-link handler.
 * Flexa Market sections must not use an in-app WebView as their primary UI.
 * Unknown website paths open in the system browser instead.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { useColors } from "@/hooks/useColors";
import { getWebsiteOrigin } from "@/lib/config";

export default function WebsiteCompatScreen() {
  const { url, path } = useLocalSearchParams<{ url?: string; path?: string }>();
  const colors = useColors();
  const router = useRouter();
  const target =
    (typeof url === "string" && url) ||
    `${getWebsiteOrigin()}${typeof path === "string" ? path : "/"}`;

  useEffect(() => {
    void Linking.openURL(target).catch(() => undefined);
  }, [target]);

  return (
    <NativeScreen
      title="Opening link"
      subtitle="This compatibility route opens the system browser. In-app sections use native screens."
    >
      <Text style={{ color: colors.mutedForeground }}>{target}</Text>
      <Pressable
        onPress={() => void Linking.openURL(target)}
        style={[styles.btn, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.btnText}>Open in browser</Text>
      </Pressable>
      <Pressable onPress={() => router.replace("/")}>
        <Text style={{ color: colors.foreground, fontWeight: "600" }}>Go home</Text>
      </Pressable>
    </NativeScreen>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: "#0F172A", fontWeight: "700" },
});
