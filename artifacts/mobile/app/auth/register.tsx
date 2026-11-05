/**
 * Native registration — uses existing POST /api/auth/register.
 * Does not change backend auth logic.
 */
import { useRegister } from "@workspace/api-client-react";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { formatApiError } from "@/lib/errors";

export default function RegisterScreen() {
  const colors = useColors();
  const router = useRouter();
  const { login: persistSession } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("Haiti");
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const registerMutation = useRegister({
    mutation: {
      onSuccess: async (data) => {
        await persistSession(data.token);
        router.replace("/(tabs)");
      },
      onError: (err) => setFormError(formatApiError(err, "Registration failed.")),
    },
  });

  const onSubmit = () => {
    setFormError(null);
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail || !password || !country.trim()) {
      setFormError("Fill in name, email, password, and country.");
      return;
    }
    if (password.length < 8) {
      setFormError("Password la dwe gen omwen 8 karaktè.");
      return;
    }
    if (!eulaAccepted) {
      setFormError("You must accept the terms (EULA).");
      return;
    }
    registerMutation.mutate({
      data: {
        name: trimmedName,
        email: trimmedEmail,
        password,
        country: country.trim(),
        eulaAccepted: true,
      },
    });
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
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: colors.mutedForeground }}>Back</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Create account
          </Text>
          <Text style={{ color: colors.mutedForeground }}>
            Same Flexa Market registration API.
          </Text>

          {(
            [
              ["Full name", name, setName, "name"],
              ["Email", email, setEmail, "email"],
              ["Password", password, setPassword, "password"],
              ["Country", country, setCountry, "country"],
            ] as const
          ).map(([label, value, setter, key]) => (
            <TextInput
              key={key}
              value={value}
              onChangeText={setter}
              placeholder={label}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize={key === "email" || key === "password" ? "none" : "words"}
              keyboardType={key === "email" ? "email-address" : "default"}
              secureTextEntry={key === "password"}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: "#1E293B",
                },
              ]}
            />
          ))}

          <Pressable
            onPress={() => setEulaAccepted((v) => !v)}
            style={styles.checkRow}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: colors.border,
                  backgroundColor: eulaAccepted ? colors.primary : "transparent",
                },
              ]}
            />
            <Text style={{ color: colors.mutedForeground, flex: 1, lineHeight: 20 }}>
              I accept the Flexa Market terms of use (EULA).
            </Text>
          </Pressable>

          {formError ? (
            <Text style={{ color: "#F87171" }}>{formError}</Text>
          ) : null}

          <Pressable
            onPress={onSubmit}
            disabled={registerMutation.isPending}
            style={[styles.cta, { backgroundColor: colors.primary }]}
          >
            {registerMutation.isPending ? (
              <ActivityIndicator color="#0F172A" />
            ) : (
              <Text style={styles.ctaText}>Create account</Text>
            )}
          </Pressable>

          <Link href="/auth/login" style={{ marginTop: 8 }}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>
              Already have an account? Sign in
            </Text>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: "700", marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 2,
  },
  cta: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  ctaText: { color: "#0F172A", fontWeight: "700", fontSize: 16 },
});
