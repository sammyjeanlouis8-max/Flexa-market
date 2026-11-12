import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";

export default function TrackLookupScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <View style={styles.root}>
      <AppHeader title="Order tracking" showBrand={false} showBack showMenu={false} />
      <View style={styles.body}>
        <Text style={styles.label}>Tracking number</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="e.g. FM-123456"
          placeholderTextColor="#94A3B8"
          autoCapitalize="characters"
        />
        <Pressable
          style={styles.btn}
          onPress={() => {
            const t = code.trim();
            if (!t) return;
            router.push(`/track/${encodeURIComponent(t)}` as any);
          }}
        >
          <Feather name="search" size={18} color="#FFFFFF" />
          <Text style={styles.btnText}>Track package</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/delivery-tracking")}>
          <Text style={styles.link}>Open delivery tracking</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  body: { padding: 20, gap: 12 },
  label: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  btn: {
    marginTop: 8,
    backgroundColor: colors.flexaGreen,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  link: { color: colors.flexaGreen, fontWeight: "700", textAlign: "center", marginTop: 8 },
});
