import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";

const BASE_LINKS: { label: string; href: string; icon: keyof typeof Feather.glyphMap }[] = [
  { label: "Flexa Music", href: "/(tabs)/music", icon: "music" },
  { label: "Edit profile", href: "/edit-profile", icon: "edit-2" },
  { label: "My orders", href: "/orders", icon: "package" },
  { label: "Seller sales", href: "/sales", icon: "bar-chart-2" },
  { label: "Seller earnings", href: "/seller-earnings", icon: "dollar-sign" },
  { label: "Become a seller", href: "/seller-registration", icon: "user-plus" },
  { label: "My listings", href: "/my-listings", icon: "grid" },
  { label: "Size / color", href: "/product-variations", icon: "layers" },
  { label: "Store manager", href: "/store-manager", icon: "users" },
  { label: "Private offers", href: "/offers", icon: "tag" },
  { label: "Favorites", href: "/favorites", icon: "heart" },
  { label: "Wallet", href: "/wallet", icon: "credit-card" },
  { label: "Redeem card", href: "/wallet-redeem", icon: "gift" },
  { label: "Referrals", href: "/referrals", icon: "share-2" },
  { label: "Addresses", href: "/addresses", icon: "map-pin" },
  { label: "Support", href: "/support", icon: "life-buoy" },
  { label: "Notifications", href: "/notifications", icon: "bell" },
  { label: "Settings", href: "/settings", icon: "settings" },
  { label: "Delivery tracking", href: "/delivery-tracking", icon: "map" },
  { label: "Flexa eSIM", href: "/esim", icon: "smartphone" },
];

export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token, logout, isLoading } = useAuth();
  const { country } = useMarketplace();

  const links = [
    ...(user?.id
      ? ([
          {
            label: "My public shop",
            href: `/shop/${user.id}`,
            icon: "shopping-bag" as const,
          },
        ] as const)
      : []),
    ...BASE_LINKS,
  ];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
      testID="profile-account"
    >
      <Text style={styles.title}>Account</Text>

      {isLoading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : user && token ? (
        <View style={styles.card}>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <Text style={styles.meta}>
            {user.country ?? country}
            {user.city ? ` · ${user.city}` : ""}
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push(`/shop/${user.id}` as any)}
            testID="profile-open-shop"
          >
            <Text style={styles.primaryBtnText}>View my shop</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => logout()}>
            <Text style={styles.secondaryBtnText}>Sign out</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.name}>Welcome to Flexa Market</Text>
          <Text style={styles.muted}>
            Sign in to buy, sell, chat, and track orders in {country}.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push("/auth/login")}>
            <Text style={styles.primaryBtnText}>Sign in</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={() => router.push("/auth/register")}>
            <Text style={styles.linkBtnText}>Create an account</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.list}>
        {links.map((item) => (
          <Pressable
            key={item.href}
            style={styles.row}
            onPress={() => router.push(item.href as any)}
            testID={`profile-link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <View style={styles.rowLeft}>
              <Feather name={item.icon} size={18} color="#0F172A" />
              <Text style={styles.rowLabel}>{item.label}</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    gap: 6,
    marginBottom: 16,
  },
  name: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  email: { fontSize: 14, color: "#475569" },
  meta: { fontSize: 13, color: "#94A3B8", marginBottom: 8 },
  muted: { fontSize: 14, color: "#64748B", lineHeight: 20 },
  primaryBtn: {
    marginTop: 10,
    height: 48,
    borderRadius: 999,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryBtn: {
    marginTop: 10,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: "#0F172A", fontWeight: "700" },
  linkBtn: { marginTop: 8, alignItems: "center", paddingVertical: 8 },
  linkBtnText: { color: "#F97316", fontWeight: "700" },
  list: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowLabel: { fontSize: 15, fontWeight: "600", color: "#0F172A" },
});
