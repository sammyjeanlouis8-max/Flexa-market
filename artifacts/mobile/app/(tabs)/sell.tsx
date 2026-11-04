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
      subtitle="Espas vandè natif natal. Piblikasyon listing konplè ap vin nan Faz 1–2."
    >
      <StatusCard
        label="Kont"
        value={token ? "Sèsyon vandè/achte aktif" : "Bezwen koneksyon"}
        detail="Menm kont customer/seller sou API egzistan."
        tone={token ? "ok" : "warn"}
      />
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/website",
            params: { url: `${getWebsiteOrigin()}/sell` },
          })
        }
        style={[styles.button, { borderColor: colors.border }]}
      >
        <Text style={{ color: colors.foreground, fontWeight: "600" }}>
          Louvri vann (konpatibilite tanporè)
        </Text>
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
