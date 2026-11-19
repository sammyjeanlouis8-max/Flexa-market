/**
 * Help Center — FAQ categories + deep links to support / legal / settings.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";

type Article = { title: string; href: string };
type Category = {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  tint: string;
  articles: Article[];
};

const CATEGORIES: Category[] = [
  {
    icon: "package",
    title: "Orders & delivery",
    tint: "#3B82F6",
    articles: [
      { title: "Place an order", href: "/orders" },
      { title: "Track a delivery", href: "/track" },
      { title: "Returns & refunds", href: "/legal/refund-policy" },
      { title: "Open a support ticket", href: "/support" },
    ],
  },
  {
    icon: "credit-card",
    title: "Payments & wallet",
    tint: colors.flexaGreen,
    articles: [
      { title: "Wallet balance & history", href: "/wallet" },
      { title: "Transfer money", href: "/wallet-transfer" },
      { title: "BNPL (buy now, pay later)", href: "/bnpl" },
      { title: "Flex Card repay", href: "/flex-card-repay" },
    ],
  },
  {
    icon: "zap",
    title: "Boost & selling",
    tint: colors.flexaOrange,
    articles: [
      { title: "My boosts", href: "/my-boosts" },
      { title: "Create a listing", href: "/sell" },
      { title: "Seller policy", href: "/legal/seller-policy" },
      { title: "Subscription plans", href: "/subscription" },
    ],
  },
  {
    icon: "user",
    title: "Account & security",
    tint: "#8B5CF6",
    articles: [
      { title: "Security settings", href: "/settings/security" },
      { title: "Forgot password", href: "/auth/forgot-password" },
      { title: "Delete my account", href: "/delete-account" },
      { title: "Privacy policy", href: "/legal/privacy" },
    ],
  },
  {
    icon: "shield",
    title: "Safety",
    tint: "#EF4444",
    articles: [
      { title: "Safety tips", href: "/legal/safety" },
      { title: "Community guidelines", href: "/legal/community-guidelines" },
      { title: "Talk to FlexaBot", href: "/chatbot" },
      { title: "Human support", href: "/support" },
    ],
  },
];

const FAQ = [
  {
    q: "How do I track my order?",
    a: "Open Track from the menu and enter your FM- tracking number, or open the order in My Orders.",
  },
  {
    q: "What is the seller commission?",
    a: "Flexa Market typically takes 7% of the sale price (seller receives 93%), unless a commission promo applies.",
  },
  {
    q: "How do I contact support?",
    a: "Use Support to open a ticket, or ask FlexaBot for quick answers. Agents reply in-app.",
  },
  {
    q: "How do I delete my account?",
    a: "Go to Delete Account, confirm with your password. Data is anonymized; some records are kept for legal reasons.",
  },
];

export default function HelpCenterScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.map((c) => ({
      ...c,
      articles: c.articles.filter((a) => a.title.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)),
    })).filter((c) => c.articles.length > 0 || c.title.toLowerCase().includes(q));
  }, [query]);

  return (
    <View style={styles.root}>
      <AppHeader title="Help Center" showBack />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hero}>How can we help?</Text>
        <Text style={styles.sub}>Browse topics or search for an answer.</Text>
        <View style={styles.search}>
          <Feather name="search" size={18} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search help…"
            placeholderTextColor="#94A3B8"
          />
        </View>

        <View style={styles.quickRow}>
          <Pressable style={styles.quick} onPress={() => router.push("/support")}>
            <Feather name="message-circle" size={18} color={colors.flexaGreen} />
            <Text style={styles.quickText}>Support</Text>
          </Pressable>
          <Pressable style={styles.quick} onPress={() => router.push("/chatbot")}>
            <Feather name="cpu" size={18} color={colors.flexaGreen} />
            <Text style={styles.quickText}>FlexaBot</Text>
          </Pressable>
          <Pressable style={styles.quick} onPress={() => router.push("/track")}>
            <Feather name="map-pin" size={18} color={colors.flexaGreen} />
            <Text style={styles.quickText}>Track</Text>
          </Pressable>
        </View>

        {filtered.map((cat) => (
          <View key={cat.title} style={styles.card}>
            <View style={styles.catHead}>
              <View style={[styles.iconWrap, { backgroundColor: `${cat.tint}18` }]}>
                <Feather name={cat.icon} size={18} color={cat.tint} />
              </View>
              <Text style={styles.catTitle}>{cat.title}</Text>
            </View>
            {cat.articles.map((a) => (
              <Pressable
                key={a.title}
                style={styles.article}
                onPress={() => router.push(a.href as any)}
              >
                <Text style={styles.articleText}>{a.title}</Text>
                <Feather name="chevron-right" size={16} color="#94A3B8" />
              </Pressable>
            ))}
          </View>
        ))}

        <Text style={styles.section}>FAQ</Text>
        {FAQ.map((item, i) => (
          <Pressable
            key={item.q}
            style={styles.faq}
            onPress={() => setOpenFaq(openFaq === i ? null : i)}
          >
            <View style={styles.faqRow}>
              <Text style={styles.faqQ}>{item.q}</Text>
              <Feather
                name={openFaq === i ? "chevron-up" : "chevron-down"}
                size={18}
                color="#64748B"
              />
            </View>
            {openFaq === i ? <Text style={styles.faqA}>{item.a}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  content: { padding: 16, paddingBottom: 40 },
  hero: { fontSize: 22, fontWeight: "800", color: colors.light.text },
  sub: { marginTop: 4, marginBottom: 14, color: colors.light.mutedForeground, fontSize: 14 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.light.text },
  quickRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  quick: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    paddingVertical: 12,
    alignItems: "center",
    gap: 6,
  },
  quickText: { fontSize: 12, fontWeight: "700", color: colors.light.text },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
    marginBottom: 12,
  },
  catHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  catTitle: { fontSize: 15, fontWeight: "800", color: colors.light.text },
  article: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.light.border,
  },
  articleText: { fontSize: 14, color: colors.light.text, flex: 1, paddingRight: 8 },
  section: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: "800",
    color: colors.light.text,
  },
  faq: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 8,
  },
  faqRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  faqQ: { flex: 1, fontWeight: "700", color: colors.light.text, fontSize: 14 },
  faqA: { marginTop: 8, color: colors.light.mutedForeground, lineHeight: 20, fontSize: 13 },
});
