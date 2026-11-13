/**
 * Privacy settings — links to policies + basic controls.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

const LINKS = [
  { title: "Privacy policy", href: "/legal/privacy" },
  { title: "Terms of service", href: "/legal/terms" },
  { title: "EULA", href: "/legal/eula" },
  { title: "Cookie policy", href: "/legal/cookies" },
  { title: "Data deletion", href: "/legal/data-deletion" },
  { title: "Delete account", href: "/delete-account" },
];

export default function SettingsPrivacyScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !token) router.replace("/auth/login");
  }, [authLoading, token, router]);

  return (
    <View style={styles.root}>
      <AppHeader title="Privacy" showBack showCart={false} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.intro}>
          Control how Flexa Market uses your data. Review policies or request deletion.
        </Text>
        {LINKS.map((l) => (
          <Pressable key={l.href} style={styles.row} onPress={() => router.push(l.href as any)}>
            <Text style={styles.title}>{l.title}</Text>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  intro: { color: "#64748B", marginBottom: 14, lineHeight: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 8,
  },
  title: { fontWeight: "700", color: colors.light.text },
});
