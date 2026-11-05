import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { StatusCard } from "@/components/StatusCard";
import { useColors } from "@/hooks/useColors";

type PhasePlaceholderProps = {
  title: string;
  subtitle: string;
  phaseLabel: string;
  detail?: string;
};

/** Native-only placeholder for unfinished native surfaces. */
export function PhasePlaceholder({
  title,
  subtitle,
  phaseLabel,
  detail,
}: PhasePlaceholderProps) {
  const colors = useColors();
  const router = useRouter();

  return (
    <NativeScreen title={title} subtitle={subtitle}>
      <StatusCard
        label="Status"
        value={phaseLabel}
        detail={detail}
        tone="warn"
      />
      <Pressable
        onPress={() => router.back()}
        style={[styles.button, { borderColor: colors.border }]}
      >
        <Text style={{ color: colors.foreground, fontWeight: "600" }}>Back</Text>
      </Pressable>
    </NativeScreen>
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
});
