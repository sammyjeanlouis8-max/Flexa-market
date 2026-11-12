import { useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";

const DOCS: Record<string, { title: string; body: string }> = {
  privacy: {
    title: "Privacy Policy",
    body: "Flexa Market collects account, device, and transaction data to operate the marketplace, prevent fraud, and improve delivery. Contact privacy@flexamarket.com for data requests.",
  },
  terms: {
    title: "Terms of Service",
    body: "By using Flexa Market you agree to marketplace rules for listings, payments, delivery, and disputes. Sellers are responsible for accurate product information and fulfillment.",
  },
  eula: {
    title: "EULA",
    body: "This End User License Agreement governs use of the Flexa Market mobile applications on Android and iOS. The app is licensed, not sold.",
  },
  "data-deletion": {
    title: "Data Deletion",
    body: "You may request account and data deletion from Account → Delete account, or email support@flexamarket.com. Some records may be retained where required by law.",
  },
};

export default function LegalScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const doc = useMemo(() => {
    const key = String(slug || "terms").toLowerCase();
    return DOCS[key] || DOCS.terms;
  }, [slug]);

  return (
    <View style={styles.root}>
      <AppHeader title={doc.title} showBrand={false} showBack showMenu={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{doc.title}</Text>
        <Text style={styles.bodyText}>{doc.body}</Text>
        <Text style={styles.more}>
          Full policies also appear at flexamarket.com/privacy-policy and flexamarket.com/terms.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  body: { padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: "800", color: colors.flexaGreen },
  bodyText: { fontSize: 15, lineHeight: 23, color: "#334155" },
  more: { marginTop: 12, fontSize: 13, color: "#64748B", lineHeight: 20 },
});
