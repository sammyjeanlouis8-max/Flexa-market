import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { StatusCard } from "@/components/StatusCard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function SellTab() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();

  return (
    <NativeScreen
      title="Vann"
      subtitle="Fòm piblikasyon natif natal ap vini nan Faz 2. Pa gen WebView sou ekran sa a."
    >
      <StatusCard
        label="Kont"
        value={token ? "Sèsyon aktif" : "Bezwen koneksyon"}
        detail="Menm kont customer/seller. API /listings deja pare sou backend."
        tone={token ? "ok" : "warn"}
      />
      <StatusCard
        label="Faz"
        value="Faz 2"
        detail="Kreye anons, foto, ak boost natif natal."
        tone="warn"
      />
      {!token ? (
        <Pressable
          onPress={() => router.push("/auth/login")}
          style={[styles.primary, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.primaryText}>Konekte</Text>
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
