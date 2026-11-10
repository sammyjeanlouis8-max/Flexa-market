/**
 * Phone login entry — BLOCKED/MISSING backend phoneToken issuer.
 * Current /otp/verify returns withdrawalToken (email channel), while
 * /auth/login-phone requires phoneToken from generatePhoneToken (unused).
 * Honest deferred screen — no fake SMS success path.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function LoginPhoneDeferred() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
      <Pressable style={styles.back} onPress={() => (router.canGoBack() ? router.back() : router.replace("/auth/login"))}>
        <Feather name="arrow-left" size={22} color="#0F172A" />
      </Pressable>
      <Text style={styles.title}>Phone sign-in</Text>
      <View style={styles.card}>
        <Text style={styles.badge}>BLOCKED — API CONTRACT</Text>
        <Text style={styles.heading}>Phone OTP login is not available in this build</Text>
        <Text style={styles.body}>
          The production OTP endpoint currently delivers email codes and returns a withdrawalToken.
          Phone login requires a phoneToken from generatePhoneToken, which is not issued by any live route.
        </Text>
        <Text style={styles.body}>Use email/password sign-in. No fake SMS success path is shown.</Text>
        <Pressable style={styles.btn} onPress={() => router.replace("/auth/login")}>
          <Text style={styles.btnText}>Back to email login</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "900", color: "#0F172A", marginBottom: 12 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, gap: 10 },
  badge: { alignSelf: "flex-start", backgroundColor: "#FEF3C7", color: "#92400E", fontWeight: "800", fontSize: 11, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: "hidden" },
  heading: { fontWeight: "800", fontSize: 16, color: "#0F172A" },
  body: { color: "#64748B", lineHeight: 20 },
  btn: { marginTop: 8, backgroundColor: "#F97316", borderRadius: 999, paddingVertical: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800" },
});
