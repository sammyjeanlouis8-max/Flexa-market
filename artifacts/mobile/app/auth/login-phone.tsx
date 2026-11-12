import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { getApiBase } from "@/lib/api";

export default function PhoneLoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${getApiBase()}/auth/phone/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Send failed (${res.status})`);
      setSent(true);
      Alert.alert("Code sent", "Check your SMS for the verification code.");
    } catch (e: any) {
      Alert.alert("Could not send code", String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${getApiBase()}/auth/phone/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Verify failed (${res.status})`);
      Alert.alert("Verified", "Phone login succeeded. Continue in the app.");
      router.replace("/");
    } catch (e: any) {
      Alert.alert("Verify failed", String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Phone login" showBrand={false} showBack showMenu={false} />
      <View style={styles.body}>
        <Text style={styles.label}>Phone number</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+509..." />
        {sent ? (
          <>
            <Text style={styles.label}>SMS code</Text>
            <TextInput style={styles.input} value={code} onChangeText={setCode} keyboardType="number-pad" />
            <Pressable style={styles.btn} onPress={() => void verify()} disabled={busy}>
              <Text style={styles.btnText}>Verify & continue</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.btn} onPress={() => void sendCode()} disabled={busy}>
            <Text style={styles.btnText}>Send code</Text>
          </Pressable>
        )}
        <Pressable onPress={() => router.push("/auth/login")}>
          <Text style={styles.link}>Use email instead</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  body: { padding: 16, gap: 10 },
  label: { fontWeight: "700", color: "#0F172A" },
  input: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, padding: 12 },
  btn: { backgroundColor: colors.flexaGreen, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { color: "#FFF", fontWeight: "800" },
  link: { color: colors.flexaOrange, fontWeight: "700", textAlign: "center", marginTop: 8 },
});
