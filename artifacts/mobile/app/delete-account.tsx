import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
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
import { deleteAccount } from "@/lib/accountSecurityApi";

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, logout, isLoading: authLoading } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (!authLoading && !token) router.replace("/auth/login");
  }, [authLoading, token, router]);

  const onDelete = () => {
    if (!token || !password.trim()) {
      Alert.alert("Password required", "Enter your password to confirm.");
      return;
    }
    Alert.alert(
      "Delete account permanently?",
      "Your profile will be anonymized. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            const result = await deleteAccount(password, { token });
            setBusy(false);
            if (!result.ok) {
              Alert.alert("Could not delete", result.error ?? "Try again");
              return;
            }
            await logout();
            router.replace("/auth/login");
          },
        },
      ],
    );
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
        <Text style={styles.title}>Delete account</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.warn}>
          Deleting anonymizes your account name, email, phone, and disables
          sign-in. Marketplace history may remain as “[Deleted Account]”.
        </Text>
        <Text style={styles.label}>Confirm with password</Text>
        <TextInput
          testID="input-delete-password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor="#94A3B8"
          style={styles.input}
          editable={!busy}
        />
        <Pressable
          style={[styles.dangerBtn, busy && { opacity: 0.7 }]}
          onPress={onDelete}
          disabled={busy}
          testID="btn-delete-account"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.dangerText}>Delete my account</Text>
          )}
        </Pressable>
      </View>
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
  warn: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  label: { fontWeight: "700", color: "#0F172A", marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0F172A",
  },
  dangerBtn: {
    marginTop: 8,
    backgroundColor: "#DC2626",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  dangerText: { color: "#fff", fontWeight: "800" },
});
