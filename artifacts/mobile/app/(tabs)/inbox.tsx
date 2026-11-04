import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { StatusCard } from "@/components/StatusCard";
import { useColors } from "@/hooks/useColors";
import { getWebsiteOrigin } from "@/lib/config";

export default function InboxTab() {
  const colors = useColors();
  const router = useRouter();

  return (
    <NativeScreen
      title="Mesaj"
      subtitle="Chat natif natal ak Socket.IO ap vini nan Faz 3. Estrikti navigasyon pare."
    >
      <StatusCard
        label="Estati"
        value="Placeholder Faz 0"
        detail="Backend mesaj / conversations / socket deja la — pa modifye."
        tone="ok"
      />
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/website",
            params: { url: `${getWebsiteOrigin()}/messages` },
          })
        }
        style={[styles.button, { borderColor: colors.border }]}
      >
        <Text style={{ color: colors.foreground, fontWeight: "600" }}>
          Louvri mesaj (konpatibilite tanporè)
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
