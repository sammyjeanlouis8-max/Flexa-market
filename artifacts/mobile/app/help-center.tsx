import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";

const FAQS = [
  {
    q: "How do I change delivery country?",
    a: "Open Home → country chip (or Settings) and pick any supported country. Guests browse that catalog; signed-in accounts follow account country rules.",
  },
  {
    q: "How do I contact support?",
    a: "Use Support in the menu to open tickets, or email support@flexamarket.com.",
  },
  {
    q: "How do payouts work for sellers?",
    a: "Seller earnings appear in Wallet / Sales. Complete KYC and payout onboarding when prompted.",
  },
];

export default function HelpCenterScreen() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <AppHeader title="Help Center" showBrand={false} showBack showMenu={false} />
      <ScrollView contentContainerStyle={styles.body}>
        {FAQS.map((f) => (
          <View key={f.q} style={styles.card}>
            <Text style={styles.q}>{f.q}</Text>
            <Text style={styles.a}>{f.a}</Text>
          </View>
        ))}
        <Pressable style={styles.link} onPress={() => router.push("/support")}>
          <Text style={styles.linkText}>Open Support tickets</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={() => router.push("/legal/privacy" as any)}>
          <Text style={styles.linkText}>Privacy Policy</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={() => router.push("/legal/terms" as any)}>
          <Text style={styles.linkText}>Terms of Service</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={() => router.push("/legal/eula" as any)}>
          <Text style={styles.linkText}>EULA</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 6,
  },
  q: { fontWeight: "800", color: "#0F172A", fontSize: 15 },
  a: { color: "#475569", lineHeight: 21, fontSize: 14 },
  link: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.flexaGreen,
    padding: 14,
  },
  linkText: { color: colors.flexaGreen, fontWeight: "800", textAlign: "center" },
});
