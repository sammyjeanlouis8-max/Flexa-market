/**
 * Security settings — change password, link to delete account / recovery.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/request";

export default function SettingsSecurityScreen() {
  const router = useRouter();
  const { token, login, isLoading: authLoading } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasQuestions, setHasQuestions] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !token) router.replace("/auth/login");
  }, [authLoading, token, router]);

  useEffect(() => {
    if (!token) return;
    apiRequest<{ hasQuestions?: boolean }>("/recovery/has-questions", { token })
      .then((d) => setHasQuestions(!!d.hasQuestions))
      .catch(() => setHasQuestions(false));
  }, [token]);

  const changePassword = async () => {
    if (!token) return;
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await apiRequest<{ token?: string }>("/auth/change-password", {
        token,
        method: "POST",
        body: { currentPassword, newPassword },
      });
      if (res.token) await login(res.token);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setOk("Password updated");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Security" showBack showCart={false} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.intro}>Protect your account with a strong password and recovery options.</Text>

        <View style={styles.card}>
          <Text style={styles.section}>Change password</Text>
          <Text style={styles.label}>Current password</Text>
          <TextInput style={styles.input} secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} placeholderTextColor="#94A3B8" placeholder="••••••••" />
          <Text style={styles.label}>New password</Text>
          <TextInput style={styles.input} secureTextEntry value={newPassword} onChangeText={setNewPassword} placeholderTextColor="#94A3B8" placeholder="At least 6 characters" />
          <Text style={styles.label}>Confirm</Text>
          <TextInput style={styles.input} secureTextEntry value={confirm} onChangeText={setConfirm} placeholderTextColor="#94A3B8" placeholder="Repeat new password" />
          {error ? <Text style={styles.err}>{error}</Text> : null}
          {ok ? <Text style={styles.ok}>{ok}</Text> : null}
          <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} onPress={() => void changePassword()} disabled={busy}>
            <Text style={styles.btnText}>{busy ? "Saving…" : "Update password"}</Text>
          </Pressable>
        </View>

        <Pressable style={styles.row} onPress={() => router.push("/auth/forgot-password")}>
          <Feather name="key" size={18} color={colors.flexaGreen} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Account recovery</Text>
            <Text style={styles.meta}>Forgot password flow</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#94A3B8" />
        </Pressable>

        <View style={styles.row}>
          <Feather name="shield" size={18} color={colors.flexaGreen} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Security questions</Text>
            <Text style={styles.meta}>
              {hasQuestions == null ? "Checking…" : hasQuestions ? "Configured" : "Not set up yet"}
            </Text>
          </View>
        </View>

        <Pressable
          style={[styles.row, { borderColor: "#FECACA" }]}
          onPress={() => router.push("/delete-account")}
        >
          <Feather name="trash-2" size={18} color="#DC2626" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: "#DC2626" }]}>Delete my account</Text>
            <Text style={styles.meta}>Permanent anonymization</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#94A3B8" />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  intro: { color: "#64748B", marginBottom: 14 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 12,
  },
  section: { fontWeight: "800", color: colors.light.text, marginBottom: 8 },
  label: { fontSize: 12, fontWeight: "700", color: "#94A3B8", marginTop: 8, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 12,
    backgroundColor: colors.light.background,
    color: colors.light.text,
  },
  err: { color: "#DC2626", marginTop: 8 },
  ok: { color: colors.flexaGreen, marginTop: 8, fontWeight: "700" },
  btn: {
    marginTop: 14,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 8,
  },
  rowTitle: { fontWeight: "700", color: colors.light.text },
  meta: { color: "#64748B", fontSize: 12, marginTop: 2 },
});
