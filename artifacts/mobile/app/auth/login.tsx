import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
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
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, getBaseUrl } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useLanguage, LANGUAGES } from "@/context/LanguageContext";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { t, lang } = useLanguage();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currentLang = LANGUAGES.find((l) => l.code === lang);

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError(t("errFillAll"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${getBaseUrl()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("errLoginFailed"));
      await login(data.token);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("errConnection"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={["#0F172A", "#1E3A5F"]} style={styles.gradient}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topRow}>
            <View style={styles.logoRow}>
              <View style={[styles.logoCircle, { backgroundColor: colors.accent }]}>
                <Text style={styles.logoLetter}>F</Text>
              </View>
              <Text style={styles.logoText}>FlexaMarket</Text>
            </View>
            <TouchableOpacity
              style={styles.langBtn}
              onPress={() => router.push("/language-picker")}
            >
              <Text style={styles.langFlag}>{currentLang?.flag ?? "🌐"}</Text>
              <Feather name="chevron-down" size={12} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <Text style={styles.heading}>{t("loginTitle")}</Text>
          <Text style={styles.sub}>{t("loginSubtitle")}</Text>

          <View style={styles.form}>
            {error ? (
              <View style={[styles.errorBox, { borderColor: "#F87171" }]}>
                <Feather name="alert-circle" size={14} color="#F87171" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Email</Text>
              <View style={[styles.inputRow, { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)" }]}>
                <Feather name="mail" size={16} color="#94A3B8" />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t("loginEmailPlaceholder")}
                  placeholderTextColor="#64748B"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="login-email"
                />
              </View>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>{t("loginPassword")}</Text>
              <View style={[styles.inputRow, { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)" }]}>
                <Feather name="lock" size={16} color="#94A3B8" />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  testID="login-password"
                />
                <TouchableOpacity onPress={() => setShowPw((v) => !v)}>
                  <Feather name={showPw ? "eye-off" : "eye"} size={16} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.btn, { backgroundColor: colors.accent, opacity: pressed || loading ? 0.85 : 1 }]}
              onPress={handleLogin}
              disabled={loading}
              testID="login-submit"
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.btnText}>{t("loginBtn")}</Text>
              )}
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.divLine} />
              <Text style={styles.divText}>{t("loginOr")}</Text>
              <View style={styles.divLine} />
            </View>

            <Pressable
              style={({ pressed }) => [styles.registerBtn, { borderColor: "rgba(255,255,255,0.2)", opacity: pressed ? 0.7 : 1 }]}
              onPress={() => router.push("/auth/register")}
              testID="go-register"
            >
              <Text style={styles.registerText}>{t("loginCreateBtn")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: { paddingHorizontal: 24, alignItems: "stretch" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 40 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoCircle: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  logoLetter: { color: "#FFF", fontSize: 24, fontFamily: "Inter_700Bold" },
  logoText: { color: "#F8FAFC", fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  langBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  langFlag: { fontSize: 18 },
  heading: { color: "#F8FAFC", fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 6 },
  sub: { color: "#94A3B8", fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 32 },
  form: { gap: 16 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, backgroundColor: "rgba(248,113,113,0.1)" },
  errorText: { color: "#F87171", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  fieldWrap: { gap: 6 },
  label: { color: "#CBD5E1", fontSize: 13, fontFamily: "Inter_500Medium" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 50 },
  input: { flex: 1, color: "#F8FAFC", fontSize: 15, fontFamily: "Inter_400Regular" },
  btn: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 4 },
  btnText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  divider: { flexDirection: "row", alignItems: "center", gap: 12 },
  divLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.1)" },
  divText: { color: "#64748B", fontSize: 13, fontFamily: "Inter_400Regular" },
  registerBtn: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  registerText: { color: "#F8FAFC", fontSize: 15, fontFamily: "Inter_500Medium" },
});
