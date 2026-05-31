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

const COUNTRIES = [
  "Haiti",
  "Dominican Republic",
  "USA",
  "Canada",
  "France",
  "Jamaica",
  "Trinidad and Tobago",
  "Barbados",
  "Guadeloupe",
  "Martinique",
  "Saint Lucia",
  "Grenada",
  "Saint Vincent and the Grenadines",
  "Antigua and Barbuda",
  "Saint Kitts and Nevis",
  "Dominica",
  "Bahamas",
  "Cuba",
  "Puerto Rico",
  "Belize",
  "Panama",
  "Colombia",
  "Venezuela",
  "Brazil",
  "Mexico",
  "Guatemala",
  "Honduras",
  "El Salvador",
  "Nicaragua",
  "Costa Rica",
  "Ecuador",
  "Peru",
  "Bolivia",
  "Other",
];

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { t, lang } = useLanguage();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("Haiti");
  const [showPw, setShowPw] = useState(false);
  const [showCountries, setShowCountries] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currentLang = LANGUAGES.find((l) => l.code === lang);

  async function handleRegister() {
    if (!name.trim() || !email.trim() || !password || !country) {
      setError(t("errFillAll"));
      return;
    }
    if (password.length < 6) {
      setError(t("errPassword6"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${getBaseUrl()}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          country,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("errRegisterFailed"));
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
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Feather name="arrow-left" size={22} color="#F8FAFC" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.langBtn}
              onPress={() => router.push("/language-picker")}
            >
              <Text style={styles.langFlag}>{currentLang?.flag ?? "🌐"}</Text>
              <Feather name="chevron-down" size={12} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <Text style={styles.heading}>{t("registerTitle")}</Text>
          <Text style={styles.sub}>{t("registerSubtitle")}</Text>

          <View style={styles.form}>
            {error ? (
              <View style={[styles.errorBox, { borderColor: "#F87171" }]}>
                <Feather name="alert-circle" size={14} color="#F87171" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>{t("registerFullName")}</Text>
              <View style={[styles.inputRow, { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)" }]}>
                <Feather name="user" size={16} color="#94A3B8" />
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder={t("registerFullNamePlaceholder")}
                  placeholderTextColor="#64748B"
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Email</Text>
              <View style={[styles.inputRow, { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)" }]}>
                <Feather name="mail" size={16} color="#94A3B8" />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@email.com"
                  placeholderTextColor="#64748B"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
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
                  placeholder={t("registerPasswordPlaceholder")}
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPw((v) => !v)}>
                  <Feather name={showPw ? "eye-off" : "eye"} size={16} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>{t("registerCountry")}</Text>
              <TouchableOpacity
                style={[styles.inputRow, { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)" }]}
                onPress={() => setShowCountries((v) => !v)}
              >
                <Feather name="globe" size={16} color="#94A3B8" />
                <Text style={[styles.input, { color: "#F8FAFC" }]}>{country}</Text>
                <Feather name={showCountries ? "chevron-up" : "chevron-down"} size={16} color="#94A3B8" />
              </TouchableOpacity>
              {showCountries && (
                <View style={[styles.dropdown, { backgroundColor: "#1E293B", borderColor: "rgba(255,255,255,0.1)" }]}>
                  {COUNTRIES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.dropItem, country === c && { backgroundColor: "rgba(249,115,22,0.15)" }]}
                      onPress={() => { setCountry(c); setShowCountries(false); }}
                    >
                      <Text style={[styles.dropText, country === c && { color: "#F97316" }]}>{c}</Text>
                      {country === c && <Feather name="check" size={14} color="#F97316" />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <Pressable
              style={({ pressed }) => [styles.btn, { backgroundColor: colors.accent, opacity: pressed || loading ? 0.85 : 1, marginTop: 8 }]}
              onPress={handleRegister}
              disabled={loading}
              testID="register-submit"
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.btnText}>{t("registerBtn")}</Text>
              )}
            </Pressable>

            <View style={styles.alreadyRow}>
              <Text style={styles.alreadyText}>{t("alreadyAccount")}</Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={[styles.alreadyLink, { color: colors.accent }]}>{t("loginBtn")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: { paddingHorizontal: 24, alignItems: "stretch" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  backBtn: { padding: 4 },
  langBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  langFlag: { fontSize: 18 },
  heading: { color: "#F8FAFC", fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 6 },
  sub: { color: "#94A3B8", fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 28 },
  form: { gap: 14 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, backgroundColor: "rgba(248,113,113,0.1)" },
  errorText: { color: "#F87171", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  fieldWrap: { gap: 6 },
  label: { color: "#CBD5E1", fontSize: 13, fontFamily: "Inter_500Medium" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 50 },
  input: { flex: 1, color: "#F8FAFC", fontSize: 15, fontFamily: "Inter_400Regular" },
  dropdown: { borderWidth: 1, borderRadius: 12, overflow: "hidden", marginTop: 4 },
  dropItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12 },
  dropText: { color: "#F8FAFC", fontSize: 14, fontFamily: "Inter_400Regular" },
  btn: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  alreadyRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 4 },
  alreadyText: { color: "#94A3B8", fontSize: 14, fontFamily: "Inter_400Regular" },
  alreadyLink: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
