import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { changePassword } from "@/lib/accountSecurityApi";

export default function SecurityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, login, isLoading: authLoading } = useAuth();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && !token) router.replace("/auth/login");
  }, [authLoading, token, router]);

  const onChange = async () => {
    if (!token) return;
    if (newPassword.length < 6) {
      Alert.alert("Too short", "New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirm) {
      Alert.alert("Mismatch", "New passwords do not match");
      return;
    }
    setBusy(true);
    const result = await changePassword(
      { currentPassword, newPassword },
      { token },
    );
    setBusy(false);
    if (!result.ok) {
      Alert.alert("Could not update", result.error);
      return;
    }
    if (result.token) await login(result.token);
    setCurrent("");
    setNew("");
    setConfirm("");
    Alert.alert("Password updated", "Use your new password next time you sign in.");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Security</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Change password</Text>
        <TextInput
          value={currentPassword}
          onChangeText={setCurrent}
          secureTextEntry
          placeholder="Current password"
          placeholderTextColor="#94A3B8"
          style={styles.input}
          testID="input-current-password"
        />
        <TextInput
          value={newPassword}
          onChangeText={setNew}
          secureTextEntry
          placeholder="New password"
          placeholderTextColor="#94A3B8"
          style={styles.input}
          testID="input-new-password"
        />
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          placeholder="Confirm new password"
          placeholderTextColor="#94A3B8"
          style={styles.input}
        />
        <Pressable
          style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
          onPress={onChange}
          disabled={busy}
          testID="btn-change-password"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Update password</Text>
          )}
        </Pressable>
      </View>

      <Pressable
        style={styles.dangerRow}
        onPress={() => router.push("/delete-account")}
        testID="link-delete-account"
      >
        <View>
          <Text style={styles.dangerTitle}>Delete account</Text>
          <Text style={styles.dangerSub}>Permanently anonymize this account</Text>
        </View>
        <Feather name="chevron-right" size={18} color="#DC2626" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 10,
  },
  section: { fontWeight: "800", color: "#0F172A", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0F172A",
  },
  primaryBtn: {
    marginTop: 4,
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "800" },
  dangerRow: {
    marginTop: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dangerTitle: { color: "#DC2626", fontWeight: "800" },
  dangerSub: { color: "#64748B", fontSize: 12, marginTop: 2 },
});
