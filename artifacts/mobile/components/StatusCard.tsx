import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

type Tone = "neutral" | "ok" | "warn" | "bad";

const TONE_ACCENT: Record<Tone, string> = {
  neutral: "#64748B",
  ok: "#22C55E",
  warn: "#F59E0B",
  bad: "#EF4444",
};

type StatusCardProps = {
  label: string;
  value: string;
  detail?: string;
  tone?: Tone;
};

export function StatusCard({
  label,
  value,
  detail,
  tone = "neutral",
}: StatusCardProps) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: "#1E293B",
          borderColor: colors.border,
          borderLeftColor: TONE_ACCENT[tone],
        },
      ]}
    >
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[styles.value, { color: colors.foreground }]}>{value}</Text>
      {detail ? (
        <Text style={[styles.detail, { color: colors.mutedForeground }]}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  label: { fontSize: 12, fontWeight: "600", textTransform: "uppercase" },
  value: { fontSize: 16, fontWeight: "600" },
  detail: { fontSize: 13, lineHeight: 18 },
});
