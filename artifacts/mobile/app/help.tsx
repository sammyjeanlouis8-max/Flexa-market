import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Topic = {
  title: string;
  body: string;
  route?: string;
};

const TOPICS: Topic[] = [
  {
    title: "Orders & delivery",
    body: "Track purchases, confirm delivery, and tip your driver after drop-off.",
    route: "/orders",
  },
  {
    title: "Payments & wallet",
    body: "Cart checkout uses your Flexa wallet. Dominican listings use Stripe card checkout.",
    route: "/wallet",
  },
  {
    title: "Kominike (messages)",
    body: "Chat with sellers for questions and private offers. Voice is for buyer–seller chat only.",
    route: "/inbox",
  },
  {
    title: "Account recovery",
    body: "Reset your password with an email code or security questions.",
    route: "/auth/forgot-password",
  },
  {
    title: "Support & FlexaBot",
    body: "Open a support ticket or ask FlexaBot. Voice messages are not allowed in support.",
    route: "/support",
  },
  {
    title: "Delete account",
    body: "Permanently anonymize your account from Security settings.",
    route: "/delete-account",
  },
];

export default function HelpCenterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Help Center</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>
          Quick answers for Flexa Market shoppers. For live help, open Support or
          FlexaBot.
        </Text>

        {TOPICS.map((t) => (
          <Pressable
            key={t.title}
            style={styles.card}
            onPress={() => (t.route ? router.push(t.route as any) : undefined)}
          >
            <Text style={styles.cardTitle}>{t.title}</Text>
            <Text style={styles.cardBody}>{t.body}</Text>
            <View style={styles.cardLink}>
              <Text style={styles.cardLinkText}>Open</Text>
              <Feather name="chevron-right" size={16} color="#F97316" />
            </View>
          </Pressable>
        ))}

        <Pressable style={styles.card} onPress={() => router.push("/legal/privacy")}>
          <Text style={styles.cardTitle}>Legal</Text>
          <Text style={styles.cardBody}>Privacy Policy, Terms of Service, and EULA.</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  lead: { color: "#64748B", fontSize: 14, lineHeight: 20, marginBottom: 4 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 6,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  cardBody: { fontSize: 13, color: "#64748B", lineHeight: 18 },
  cardLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  cardLinkText: { color: "#F97316", fontWeight: "700", fontSize: 13 },
});
