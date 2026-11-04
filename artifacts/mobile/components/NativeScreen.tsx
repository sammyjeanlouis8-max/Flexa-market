import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

type NativeScreenProps = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
};

/**
 * Shared chrome for Phase 0+ native screens (header + safe area).
 */
export function NativeScreen({
  title,
  subtitle,
  children,
  scroll = true,
  contentStyle,
}: NativeScreenProps) {
  const colors = useColors();
  const body = (
    <View style={[styles.body, contentStyle]}>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {subtitle}
        </Text>
      ) : null}
      {children}
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  body: { paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.3 },
  subtitle: { fontSize: 15, lineHeight: 22 },
});
