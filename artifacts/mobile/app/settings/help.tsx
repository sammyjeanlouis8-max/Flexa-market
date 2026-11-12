/**
 * Settings help — shortcuts into help center / support / chatbot.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";

const LINKS = [
  { title: "Help Center", href: "/help-center", icon: "help-circle" as const },
  { title: "Support tickets", href: "/support", icon: "message-circle" as const },
  { title: "FlexaBot", href: "/chatbot", icon: "cpu" as const },
  { title: "Track a package", href: "/track", icon: "map-pin" as const },
  { title: "CalcAI", href: "/calculator", icon: "percent" as const },
  { title: "Community guidelines", href: "/legal/community-guidelines", icon: "book" as const },
];

export default function SettingsHelpScreen() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <AppHeader title="Help" showBack showCart={false} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.intro}>Get answers fast or talk to a human agent.</Text>
        {LINKS.map((l) => (
          <Pressable key={l.href} style={styles.row} onPress={() => router.push(l.href as any)}>
            <Feather name={l.icon} size={18} color={colors.flexaGreen} />
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
  intro: { color: "#64748B", marginBottom: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 8,
  },
  title: { flex: 1, fontWeight: "700", color: colors.light.text },
});
