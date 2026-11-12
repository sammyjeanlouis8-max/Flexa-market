import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";

export default function SettingsPrivacyScreen() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <AppHeader title="Privacy" showBrand={false} showBack showMenu={false} />
      <View style={styles.body}>
        <Text style={styles.copy}>Privacy settings for your Flexa Market account.</Text>
        <Pressable style={styles.row} onPress={() => router.push("/edit-profile")}>
          <Text style={styles.rowText}>Edit profile</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push("/language-picker")}>
          <Text style={styles.rowText}>Language</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push("/help-center")}>
          <Text style={styles.rowText}>Help Center</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push("/legal/privacy" as any)}>
          <Text style={styles.rowText}>Privacy policy</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  body: { padding: 16, gap: 10 },
  copy: { color: "#64748B", marginBottom: 8 },
  row: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, padding: 14 },
  rowText: { fontWeight: "700", color: colors.flexaGreen },
});
