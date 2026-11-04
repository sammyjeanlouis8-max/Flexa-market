import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { StatusCard } from "@/components/StatusCard";
import { useColors } from "@/hooks/useColors";
import { getWebsiteOrigin } from "@/lib/config";

export default function SearchTab() {
  const colors = useColors();
  const router = useRouter();

  return (
    <NativeScreen
      title="Rechèch"
      subtitle="Ekran natif natal pou rechèch marketplace. Rezilta konplè ap vini nan Faz 1."
    >
      <StatusCard
        label="Estati"
        value="Estrikti pare"
        detail="API listings/search deja disponib sou backend — UI natif ap suiv."
        tone="ok"
      />
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/website",
            params: { url: `${getWebsiteOrigin()}/search` },
          })
        }
        style={[styles.button, { borderColor: colors.border }]}
      >
        <Text style={{ color: colors.foreground, fontWeight: "600" }}>
          Louvri rechèch (konpatibilite tanporè)
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
