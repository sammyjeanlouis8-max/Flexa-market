import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchSellerStats, type WholesaleSellerStats } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function SellerHomeScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<WholesaleSellerStats | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      void fetchSellerStats({ token })
        .then(setStats)
        .catch(() => setStats(null));
    }, [token]),
  );

  const items = [
    { title: "Add product", meta: "Photo Picker · Wasabi · verified depot", href: "/wholesale/seller/new", badge: "New" },
    { title: "Dashboard", meta: "Listings · chats · depots", href: "/wholesale/seller/dashboard" },
    {
      title: "My warehouses",
      meta: stats ? `${stats.warehouses.verified}/${stats.warehouses.total} verified` : "Multi-country depots",
      href: "/wholesale/seller/warehouse",
    },
    {
      title: "Inventory",
      meta: "Stock by warehouse",
      href: "/wholesale/seller/inventory",
    },
    {
      title: "Drafts",
      meta: stats ? `${stats.listings.draft} unpublished` : "Unpublished",
      href: "/wholesale/seller/drafts",
    },
    { title: "Archived", meta: "Hidden listings", href: "/wholesale/seller/archived" },
    {
      title: "Inbound chats",
      meta: stats ? `${stats.openInquiries} open` : "Quote requests",
      href: "/wholesale/seller/inquiries",
      badge: "Chat",
    },
    { title: "Analytics", meta: "Depot performance", href: "/wholesale/seller/analytics" },
    { title: "Documents", meta: "Business verification docs", href: "/wholesale/seller/documents" },
    { title: "Profile", meta: "Seller profile", href: "/wholesale/seller/profile" },
    { title: "Settings", meta: "Seller preferences", href: "/wholesale/seller/settings" },
  ];

  return (
    <WholesaleGate>
      <WholesaleShell title="My wholesale" subtitle="Listings, depots, and inbound chats">
        {stats ? (
          <View style={styles.stats}>
            <Text style={styles.statText}>{stats.listings.active} active</Text>
            <Text style={styles.statText}>{stats.warehouses.verified} verified depots</Text>
          </View>
        ) : token ? (
          <ActivityIndicator color={T.accent} style={{ marginBottom: 10 }} />
        ) : null}
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable key={item.href} style={styles.row} onPress={() => router.push(item.href as any)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.meta}>{item.meta}</Text>
              </View>
              {item.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 12, marginBottom: 12 },
  statText: {
    backgroundColor: T.accentSoft,
    color: T.forest,
    fontWeight: "800",
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { marginTop: 2, fontSize: 12, color: T.muted },
  badge: {
    backgroundColor: T.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: T.accent, textTransform: "uppercase" },
});
