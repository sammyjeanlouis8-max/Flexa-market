import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { StatusCard } from "@/components/StatusCard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { getWebsiteOrigin } from "@/lib/config";

export default function SellTab() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();

  return (
    <NativeScreen
      title="Vann"
      subtitle="Piblikasyon listing natif natal ap vin nan Faz 2. Ou ka vann atravè konpatibilite web kounye a."
    >
      <StatusCard
        label="Kont"
        value={token ? "Sèsyon aktif — ou ka pibliye" : "Konekte pou vann"}
        detail="Menm API /sell sou backend egzistan."
        tone={token ? "ok" : "warn"}
      />
      {!token ? (
        <Pressable
          onPress={() => router.push("/auth/login")}
          style={[styles.primary, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.primaryText}>Konekte</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/website",
              params: { url: `${getWebsiteOrigin()}/sell` },
            })
          }
          style={[styles.primary, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.primaryText}>Pibliye anons (tanporè web)</Text>
        </Pressable>
      )}
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
