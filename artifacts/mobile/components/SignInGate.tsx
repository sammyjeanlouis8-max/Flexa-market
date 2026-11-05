import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export function SignInGate({ message }: { message: string }) {
  const colors = useColors();
  const router = useRouter();
  return (
    <View style={styles.box}>
      <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>{message}</Text>
      <Pressable
        onPress={() => router.push("/auth/login")}
        style={[styles.cta, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.ctaText}>Sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12, marginTop: 8 },
  cta: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: { color: "#0F172A", fontWeight: "700", fontSize: 15 },
});
