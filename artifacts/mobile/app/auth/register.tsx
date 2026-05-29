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

const COUNTRIES = ["Haiti", "USA", "Canada", "France", "Dominican Republic", "Other"];

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("Haiti");
  const [showPw, setShowPw] = useState(false);
  const [showCountries, setShowCountries] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRegister() {
    if (!name.trim() || !email.trim() || !password || !country) {
      setError("Tanpri ranpli tout chan obligatwa yo.");
      return;
    }
    if (password.length < 6) {
      setError("Modepas dwe gen omwen 6 karaktè.");
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
      if (!res.ok) throw new Error(data.message || "Enskripsyon echwe");
      await login(data.token);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erè enskripsyon");
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
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color="#F8FAFC" />
          </TouchableOpacity>

          <Text style={styles.heading}>Kreye kont</Text>
          <Text style={styles.sub}>Rejwenn kominote FlexaMarket la.</Text>

          <View style={styles.form}>
            {error ? (
              <View style={[styles.errorBox, { borderColor: "#F87171" }]}>
                <Feather name="alert-circle" size={14} color="#F87171" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {[
              { label: "Non Konplè", value: name, setter: setName, placeholder: "Jan Pyè", icon: "user" as const, keyboardType: "default" as const },
              { label: "Email", value: email, setter: setEmail, placeholder: "ou@email.com", icon: "mail" as const, keyboardType: "email-address" as const },
            ].map((f) => (
              <View key={f.label} style={styles.fieldWrap}>
                <Text style={styles.label}>{f.label}</Text>
                <View style={[styles.inputRow, { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)" }]}>
                  <Feather name={f.icon} size={16} color="#94A3B8" />
                  <TextInput
                    style={styles.input}
                    value={f.value}
                    onChangeText={f.setter}
                    placeholder={f.placeholder}
                    placeholderTextColor="#64748B"
                    keyboardType={f.keyboardType}
                    autoCapitalize={f.keyboardType === "email-address" ? "none" : "words"}
                    autoCorrect={false}
                  />
                </View>
              </View>
            ))}

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Modepas</Text>
              <View style={[styles.inputRow, { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)" }]}>
                <Feather name="lock" size={16} color="#94A3B8" />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Omwen 6 karaktè"
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
              <Text style={styles.label}>Peyi</Text>
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
                <Text style={styles.btnText}>Kreye Kont</Text>
              )}
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
  backBtn: { marginBottom: 24, alignSelf: "flex-start", padding: 4 },
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
});
