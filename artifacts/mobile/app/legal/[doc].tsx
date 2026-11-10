import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DOCS: Record<string, { title: string; body: string }> = {
  privacy: {
    title: "Privacy Policy",
    body: `Flexa Market (“we”) collects account details (name, email, phone), marketplace activity, device identifiers for security, and delivery information needed to fulfill orders.

We use this data to operate the marketplace, prevent fraud, process payments via Stripe and wallet systems, and send transactional notifications.

We do not sell personal data. Service providers (hosting, payments, messaging, storage) process data under contract.

You may request access, correction, or deletion from Settings → Security → Delete account, or contact support@flexamarket.com.

Full web policy: https://flexamarket.com/privacy-policy`,
  },
  terms: {
    title: "Terms of Service",
    body: `By using Flexa Market you agree to follow community and seller rules, provide accurate listing and account information, and not misuse messaging, payments, or delivery systems.

Listings are moderated. Prohibited items and scams may lead to suspension. Escrow and confirmation rules protect buyers and sellers for eligible orders.

Disputes: use in-app Support tickets. Payment chargebacks are handled under Stripe and local regulations.

Full web terms: https://flexamarket.com/terms-of-service`,
  },
  eula: {
    title: "End User License Agreement",
    body: `The Flexa Market mobile application is licensed, not sold. You may use the app for personal marketplace activity on devices you own or control.

You may not reverse engineer, redistribute, or misuse the app to attack Flexa Market infrastructure. Push notifications and camera/microphone permissions are used for messaging and media you choose to send.

Digital goods purchases on Android may be restricted by platform policy. Physical goods checkout uses wallet balance or Stripe hosted checkout.

Continued use means you accept this EULA together with the Privacy Policy and Terms of Service.`,
  },
};

export default function LegalDocScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const key = String(doc || "privacy").toLowerCase();
  const content = DOCS[key] ?? DOCS.privacy;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/help"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>{content.title}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.body}>{content.body}</Text>
        <View style={styles.links}>
          {(["privacy", "terms", "eula"] as const).map((d) => (
            <Pressable key={d} onPress={() => router.replace(`/legal/${d}`)}>
              <Text style={[styles.link, key === d && styles.linkOn]}>
                {DOCS[d].title}
              </Text>
            </Pressable>
          ))}
        </View>
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
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "800", color: "#0F172A", maxWidth: "70%" },
  content: { padding: 16, paddingBottom: 40 },
  body: { color: "#334155", fontSize: 14, lineHeight: 22 },
  links: { marginTop: 24, gap: 10 },
  link: { color: "#64748B", fontWeight: "600" },
  linkOn: { color: "#F97316" },
});
