import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
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

const EULA_VERSION_ACK = true;

export default function LoginScreen() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useAndroidBack();

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
          eulaAccepted: EULA_VERSION_ACK,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Sign in failed (${res.status})`);
      }
      if (!data.token) throw new Error("No session token returned.");
      await login(data.token);
      router.replace("/");
    } catch (e: any) {
      setError(e?.message || "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.pad}>
          <Pressable
            style={styles.back}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          >
            <Feather name="x" size={22} color="#F8FAFC" />
          </Pressable>
          <Text style={styles.brand}>Flexa Market</Text>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.muted}>Use your existing Flexa Market account.</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
            placeholderTextColor="#64748B"
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#64748B"
            onSubmitEditing={() => void onSubmit()}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.primary, busy && styles.disabled]}
            disabled={busy || !email.trim() || !password}
            onPress={() => void onSubmit()}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Continue</Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.replace("/auth/register")}>
            <Text style={styles.link}>Create an account</Text>
          </Pressable>
          <Text style={styles.hint}>{t("sLanguage")} available in Profile.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  flex: { flex: 1 },
  pad: { flex: 1, padding: 20, gap: 8 },
  back: { alignSelf: "flex-start", padding: 4, marginBottom: 8 },
  brand: { fontSize: 28, fontWeight: "800", color: "#F8FAFC" },
  title: { fontSize: 18, fontWeight: "700", color: "#F97316" },
  muted: { color: "#94A3B8", marginBottom: 12 },
  label: { color: "#CBD5E1", fontSize: 13, fontWeight: "600", marginTop: 8 },
  input: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#F8FAFC",
    fontSize: 16,
  },
  error: { color: "#FCA5A5", marginTop: 8 },
  primary: {
    marginTop: 16,
    backgroundColor: "#F97316",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  disabled: { opacity: 0.6 },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  link: { marginTop: 16, color: "#F97316", fontWeight: "600", textAlign: "center" },
  hint: { marginTop: 12, color: "#64748B", fontSize: 12, textAlign: "center" },
});
