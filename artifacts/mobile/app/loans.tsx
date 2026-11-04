/**
 * Loan feature — intentionally dormant in the native app UI.
 * Route and backend/API remain available for later reactivation.
 * Do not delete this file or related loan APIs.
 */
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { StatusCard } from "@/components/StatusCard";
import { LOANS_NAV_VISIBLE } from "@/lib/featureFlags";
import { useColors } from "@/hooks/useColors";

export default function LoansScreen() {
  const colors = useColors();
  const router = useRouter();

  return (
    <NativeScreen
      title="Loans"
      subtitle="This feature is temporarily hidden from navigation. Existing loan APIs and data are unchanged."
    >
      <StatusCard
        label="Visibility"
        value={LOANS_NAV_VISIBLE ? "Visible in navigation" : "Hidden from navigation"}
        detail="Set LOANS_NAV_VISIBLE to true in lib/featureFlags.ts to restore the Loan entry points later."
        tone="warn"
      />
      <Pressable
        onPress={() => router.replace("/")}
        style={[styles.button, { borderColor: colors.border }]}
      >
        <Text style={{ color: colors.foreground, fontWeight: "600" }}>Back to Home</Text>
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
