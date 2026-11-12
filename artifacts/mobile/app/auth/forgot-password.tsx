import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { getApiBase } from "@/lib/api";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <View style={styles.root}>
      <AppHeader title="Forgot password" showBrand={false} showBack showMenu={false} />
      <View style={styles.body}>
        <Text style={styles.copy}>We will email a reset link if an account exists for that address.</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" />
        <Pressable
          style={styles.btn}
          disabled={busy}
          onPress={() => {
            setBusy(true);
            fetch(`${getApiBase()}/auth/forgot-password`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email }),
            })
              .then(async (res) => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
                Alert.alert("Check your email", "If the account exists, a reset link was sent.");
                router.back();
              })
              .catch((e) => Alert.alert("Failed", String(e.message || e)))
              .finally(() => setBusy(false));
          }}
        >
          <Text style={styles.btnText}>Send reset link</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  body: { padding: 16, gap: 12 },
  copy: { color: "#475569", lineHeight: 21 },
  input: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, padding: 12 },
  btn: { backgroundColor: colors.flexaGreen, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { color: "#FFF", fontWeight: "800" },
});
