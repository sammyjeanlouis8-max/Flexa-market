/**
 * Native email/password login — uses existing POST /api/auth/login.
 * Does not change backend auth logic.
 */
import { useLogin } from "@workspace/api-client-react";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const { login: persistSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const loginMutation = useLogin({
    mutation: {
      onSuccess: async (data) => {
        await persistSession(data.token);
        router.replace("/(tabs)");
      },
      onError: (err) => {
        const message =
          err instanceof Error ? err.message : "Koneksyon echwe. Eseye ankò.";
        setFormError(message);
      },
    },
  });

  const onSubmit = () => {
    setFormError(null);
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setFormError("Antre imèl ak modpas ou.");
      return;
    }
    loginMutation.mutate({ data: { email: trimmed, password } });
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right", "bottom"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.body}>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: colors.mutedForeground }}>Retounen</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Konekte
          </Text>
          <Text style={{ color: colors.mutedForeground, marginBottom: 8 }}>
            Menm kont Flexa Market (API egzistan).
          </Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Imèl"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            style={[
              styles.input,
              {
                color: colors.foreground,
                borderColor: colors.border,
                backgroundColor: "#1E293B",
              },
            ]}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Modpas"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            autoComplete="password"
            style={[
              styles.input,
              {
                color: colors.foreground,
                borderColor: colors.border,
                backgroundColor: "#1E293B",
              },
            ]}
          />

          {formError ? (
            <Text style={{ color: "#F87171" }}>{formError}</Text>
          ) : null}

          <Pressable
            onPress={onSubmit}
            disabled={loginMutation.isPending}
            style={[styles.cta, { backgroundColor: colors.primary }]}
          >
            {loginMutation.isPending ? (
              <ActivityIndicator color="#0F172A" />
            ) : (
              <Text style={styles.ctaText}>Konekte</Text>
            )}
          </Pressable>

          <Link href="/auth/register" style={{ marginTop: 12 }}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>
              Kreye yon kont
            </Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: "700", marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  cta: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  ctaText: { color: "#0F172A", fontWeight: "700", fontSize: 16 },
});
