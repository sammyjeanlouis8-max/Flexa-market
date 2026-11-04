import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { StatusCard } from "@/components/StatusCard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function ProfileTab() {
  const colors = useColors();
  const router = useRouter();
  const { user, token, isLoading, logout } = useAuth();

  return (
    <NativeScreen
      title="Pwofil"
      subtitle="Sèsyon natif natal ak JWT lokal (SecureStore). Pa gen WebView."
    >
      <StatusCard
        label="Itilizatè"
        value={
          isLoading
            ? "Ap chaje…"
            : user?.name || user?.email || (token ? "Konekte" : "Envite")
        }
        detail={
          user?.email
            ? user.email
            : token
              ? "Jeton JWT aktif"
              : "Konekte pou jere favori, lòd, ak mesaj"
        }
        tone={token ? "ok" : "neutral"}
      />

      {user?.role ? (
        <StatusCard label="Wòl" value={String(user.role)} tone="ok" />
      ) : null}

      <View style={styles.actions}>
        {!token ? (
          <>
            <Pressable
              onPress={() => router.push("/auth/login")}
              style={[styles.primary, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.primaryText}>Konekte</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/auth/register")}
              style={[styles.secondary, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                Kreye kont
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={() => router.push("/favorites")}
              style={[styles.secondary, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                Favori
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/subscription")}
              style={[styles.secondary, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                Abònman (Apple IAP)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/orders")}
              style={[styles.secondary, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                Lòd (Faz 2)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void logout()}
              style={[styles.secondary, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                Dekonekte
              </Text>
            </Pressable>
          </>
        )}
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
