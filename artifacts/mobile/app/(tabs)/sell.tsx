import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { StatusCard } from "@/components/StatusCard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

/** Default UI language: English. */
export default function SellTab() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();

  return (
    <NativeScreen
      title="Sell"
      subtitle="Native listing publish arrives in Phase 2. This screen has no WebView."
    >
      <StatusCard
        label="Account"
        value={token ? "Session active" : "Sign-in required"}
        detail="Same customer/seller account. Listings API is ready on the backend."
        tone={token ? "ok" : "warn"}
      />
      <StatusCard
        label="Phase"
        value="Phase 2"
        detail="Native create listing, photos, and boosts."
        tone="warn"
      />
      {!token ? (
        <Pressable
          onPress={() => router.push("/auth/login")}
          style={[styles.primary, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.primaryText}>Sign in</Text>
        </Pressable>
      ) : null}
    </NativeScreen>
  );
}

const styles = StyleSheet.create({
  primary: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: "#0F172A", fontWeight: "700" },
});
