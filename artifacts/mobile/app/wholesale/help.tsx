import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

const LINKS = [
  { title: "Search depot stock", href: "/wholesale/search", meta: "Country-locked catalog" },
  { title: "Warehouse map", href: "/wholesale/map", meta: "Native GPS depots" },
  { title: "Depot pickup", href: "/wholesale/pickup", meta: "Verified warehouses" },
  { title: "Inquiries & quotes", href: "/wholesale/inquiries", meta: "Chat-only negotiation" },
  { title: "Seller onboarding", href: "/wholesale/seller/onboarding", meta: "Business + warehouse" },
  { title: "Seller verification", href: "/wholesale/verification", meta: "Documents & depots" },
];

export default function WholesaleHelpScreen() {
  const router = useRouter();
  return (
    <WholesaleGate>
      <WholesaleShell title="Help" subtitle="Flexa Wholesale is chat-only — no cart or Buy Now">
        <Text style={styles.body}>
          Buyers only see products from verified, active warehouses in their account country. Sellers living
          abroad can sell in a country only after that country’s warehouse is verified. Media uploads use the
          native Photo Picker and camera; at least one photo is required to publish (videos are stored
          separately and do not count).
        </Text>
        <View style={styles.list}>
          {LINKS.map((item) => (
            <Pressable key={item.href} style={styles.row} onPress={() => router.push(item.href as any)}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>{item.meta}</Text>
            </Pressable>
          ))}
        </View>
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, color: T.muted, lineHeight: 20, marginBottom: 14 },
  list: { gap: 8 },
  row: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { marginTop: 2, fontSize: 12, color: T.muted },
});
