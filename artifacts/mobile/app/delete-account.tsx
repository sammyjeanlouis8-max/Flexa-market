/**
 * Account deletion — DELETE /api/users/me { password }
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

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { token, logout, isLoading: authLoading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !token) router.replace("/auth/login");
  }, [authLoading, token, router]);

  const submit = () => {
    if (confirm.trim().toUpperCase() !== "DELETE") {
      setError('Type DELETE to confirm');
      return;
    }
    if (!password.trim()) {
      setError("Password is required");
      return;
    }
    Alert.alert(
      "Delete account permanently?",
      "This anonymizes your profile. Some transaction records may be retained for legal reasons.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!token) return;
            setBusy(true);
            setError(null);
            try {
              await apiRequest("/users/me", {
                token,
                method: "DELETE",
                body: { password },
              });
              await logout();
              Alert.alert("Account deleted", "Your account has been removed.");
              router.replace("/");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Deletion failed");
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Delete account" showBack showCart={false} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.warn}>
          <Feather name="alert-triangle" size={22} color="#B45309" />
          <Text style={styles.warnText}>
            Account deletion is permanent. Listings and messages become inaccessible. Promo balances are not refundable.
          </Text>
        </View>
        <Text style={styles.section}>What gets removed</Text>
        {["Profile & photos", "Listings visibility", "Notifications", "Login access"].map((t) => (
          <Text key={t} style={styles.bullet}>
            • {t}
          </Text>
        ))}
        <Text style={styles.section}>Confirm</Text>
        <Text style={styles.label}>Type DELETE</Text>
        <TextInput
          style={styles.input}
          value={confirm}
          onChangeText={setConfirm}
          autoCapitalize="characters"
          placeholder="DELETE"
          placeholderTextColor="#94A3B8"
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Current password"
          placeholderTextColor="#94A3B8"
        />
        {error ? <Text style={styles.err}>{error}</Text> : null}
        <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
          <Text style={styles.btnText}>{busy ? "Deleting…" : "Delete my account"}</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/support")}>
          <Text style={styles.link}>Need help? Contact support</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  warn: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  warnText: { flex: 1, color: "#92400E", lineHeight: 20 },
  section: { fontWeight: "800", fontSize: 15, marginTop: 8, marginBottom: 6, color: colors.light.text },
  bullet: { color: "#475569", marginBottom: 4 },
  label: { fontSize: 12, fontWeight: "700", color: "#94A3B8", marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 12,
    color: colors.light.text,
  },
  err: { color: colors.light.destructive, marginTop: 8 },
  btn: {
    marginTop: 18,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  link: { marginTop: 16, textAlign: "center", color: colors.flexaGreen, fontWeight: "700" },
});
