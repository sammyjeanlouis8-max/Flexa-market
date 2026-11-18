/**
 * Public tracking entry — lookup FM- tracking numbers via /api/track/:tn
 */
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";

export default function TrackScreen() {
  const router = useRouter();
  const [tn, setTn] = useState("FM-");
  const [error, setError] = useState<string | null>(null);

  const go = () => {
    const v = tn.trim().toUpperCase();
    if (!v.startsWith("FM-") || v.length < 6) {
      setError("Enter a valid tracking number (FM-XXXXXXXXX)");
      return;
    }
    setError(null);
    router.push(`/track/${encodeURIComponent(v)}`);
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Track order" showBack />
      <View style={styles.body}>
        <Text style={styles.hero}>Public delivery tracking</Text>
        <Text style={styles.sub}>Enter the FM tracking number from your receipt or SMS.</Text>
        <TextInput
          style={styles.input}
          value={tn}
          onChangeText={setTn}
          autoCapitalize="characters"
          placeholder="FM-XXXXXXXXX"
          placeholderTextColor="#94A3B8"
          onSubmitEditing={go}
        />
        {error ? <Text style={styles.err}>{error}</Text> : null}
        <Pressable style={styles.btn} onPress={go}>
          <Text style={styles.btnText}>Track</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/orders")}>
          <Text style={styles.link}>Open my orders</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  body: { padding: 16 },
  hero: { fontSize: 20, fontWeight: "800", color: colors.light.text },
  sub: { color: "#64748B", marginTop: 6, marginBottom: 16 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    height: 50,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: "700",
    color: colors.light.text,
    letterSpacing: 0.5,
  },
  err: { color: colors.light.destructive, marginTop: 8 },
  btn: {
    marginTop: 14,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  link: { marginTop: 16, color: colors.flexaGreen, fontWeight: "700", textAlign: "center" },
});
