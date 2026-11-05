import { useRouter, type Href } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { useColors } from "@/hooks/useColors";

export function NavLink({
  href,
  label,
  detail,
}: {
  href: Href;
  label: string;
  detail?: string;
}) {
  const colors = useColors();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(href)}
      style={[styles.row, { borderColor: colors.border }]}
    >
      <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 15 }}>
        {label}
      </Text>
      {detail ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
});
