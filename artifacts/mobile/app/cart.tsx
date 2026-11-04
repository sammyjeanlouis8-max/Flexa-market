import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { StatusCard } from "@/components/StatusCard";
import { useColors } from "@/hooks/useColors";

export default function CartScreen() {
  const colors = useColors();
  const router = useRouter();

  return (
    <NativeScreen
      title="Cart"
      subtitle="Native cart and checkout continue in the next commerce sub-phase. No WebView."
    >
      <StatusCard
        label="Status"
        value="Native shell"
        detail="Listing detail buy actions and payment methods will attach to existing order APIs."
        tone="warn"
      />
      <Pressable
        onPress={() => router.push("/orders")}
        style={[styles.btn, { borderColor: colors.border }]}
      >
        <Text style={{ color: colors.foreground, fontWeight: "600" }}>View orders</Text>
      </Pressable>
    </NativeScreen>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
});
