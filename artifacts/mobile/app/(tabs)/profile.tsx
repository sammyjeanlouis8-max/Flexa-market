import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { StatusCard } from "@/components/StatusCard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { getWebsiteOrigin } from "@/lib/config";

export default function ProfileTab() {
  const colors = useColors();
  const router = useRouter();
  const { user, token, isLoading, logout } = useAuth();

  return (
    <NativeScreen
      title="Pwofil"
      subtitle="Jesyon sèsyon lokal. Login natif konplè ap vin pita — API auth pa chanje."
    >
      <StatusCard
        label="Itilizatè"
        value={
          isLoading
            ? "Ap chaje…"
            : user?.name || user?.email || (token ? "Konekte" : "Envite")
        }
        detail={
          user?.role
            ? `Wòl: ${user.role}`
            : token
              ? "Jeton JWT aktif sou aparèy la"
              : "Pa gen jeton lokal"
        }
        tone={token ? "ok" : "neutral"}
      />

      <View style={styles.actions}>
        {!token ? (
          <Pressable
            onPress={() => router.push("/auth/login")}
            style={[styles.primary, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.primaryText}>Konekte</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void logout()}
            style={[styles.secondary, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>
              Dekonekte (lokal)
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() =>
            router.push({
              pathname: "/website",
              params: { url: `${getWebsiteOrigin()}/profile/edit` },
            })
          }
          style={[styles.secondary, { borderColor: colors.border }]}
        >
          <Text style={{ color: colors.foreground, fontWeight: "600" }}>
            Edit pwofil (konpatibilite tanporè)
          </Text>
        </Pressable>
      </View>
    </NativeScreen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10, marginTop: 8 },
  primary: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: "#0F172A", fontWeight: "700", fontSize: 15 },
  secondary: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
  },
});
