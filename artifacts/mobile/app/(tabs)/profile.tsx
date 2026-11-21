import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";

const ACTION_TILES: {
  label: string;
  href: string;
  icon: keyof typeof Feather.glyphMap;
  bg: string;
  color: string;
}[] = [
  { label: "+ Add a product", href: "/sell", icon: "plus", bg: "#D1FAE5", color: "#047857" },
  { label: "My videos", href: "/videos", icon: "play-circle", bg: "#DBEAFE", color: "#1D4ED8" },
  { label: "My boosts", href: "/my-boosts", icon: "speaker", bg: "#FFEDD5", color: "#C2410C" },
  { label: "My Drafts", href: "/my-listings", icon: "package", bg: "#EDE9FE", color: "#6D28D9" },
];

const LINKS: {
  label: string;
  href: string;
  icon: keyof typeof Feather.glyphMap;
  sub?: string;
}[] = [
  { label: "Edit profile", href: "/edit-profile", icon: "edit-2", sub: "Name, photo, phone, password" },
  { label: "My orders", href: "/orders", icon: "package", sub: "Purchases, tracking, delivery PIN" },
  { label: "Seller sales", href: "/sales", icon: "bar-chart-2", sub: "Earnings and sale orders" },
  { label: "My listings", href: "/my-listings", icon: "grid", sub: "Manage published products" },
  { label: "Private offers", href: "/offers", icon: "tag", sub: "Negotiate without changing list price" },
  { label: "Favorites", href: "/favorites", icon: "heart", sub: "Saved products" },
  { label: "Addresses", href: "/addresses", icon: "map-pin", sub: "Delivery address book" },
  { label: "Notifications", href: "/notifications", icon: "bell", sub: "Orders, chat, price drops" },
  { label: "Support", href: "/support", icon: "life-buoy", sub: "Tickets and FlexaBot" },
  { label: "Flexa Music", href: "/(tabs)/music", icon: "music", sub: "Browse and play" },
  { label: "Settings", href: "/settings", icon: "settings", sub: "Language and preferences" },
  { label: "Help Center", href: "/embed/help-center", icon: "help-circle", sub: "FAQ (WebView)" },
  { label: "Privacy Policy", href: "/embed/privacy", icon: "shield", sub: "Read-only" },
  { label: "Terms of Service", href: "/embed/terms", icon: "file-text", sub: "Read-only" },
];

export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token, logout, isLoading } = useAuth();
  const { country } = useMarketplace();
  const initial = (user?.name || "F").trim().charAt(0).toUpperCase();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 24,
      }}
    >
      <Text style={styles.title}>Settings</Text>

      {isLoading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : user && token ? (
        <>
          <View style={styles.card}>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{user.name}</Text>
                  {(user as { isVerified?: boolean }).isVerified ? (
                    <View style={styles.verified}>
                      <Feather name="check" size={11} color="#047857" />
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.email}>{user.email}</Text>
                <Text style={styles.meta}>
                  Account country: {user.country ?? country}
                </Text>
              </View>
              <Pressable
                style={styles.iconBtn}
                onPress={() => router.push("/edit-profile")}
                accessibilityLabel="Edit profile"
              >
                <Feather name="edit-2" size={16} color="#0F172A" />
              </Pressable>
            </View>
          </View>

          <View style={styles.tiles}>
            {ACTION_TILES.map((t) => (
              <Pressable
                key={t.label}
                style={[styles.tile, { backgroundColor: t.bg }]}
                onPress={() => router.push(t.href as any)}
              >
                <Feather name={t.icon} size={20} color={t.color} />
                <Text style={[styles.tileLabel, { color: t.color }]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.name}>Welcome to Flexa Market</Text>
          <Text style={styles.muted}>
            Sign in to buy, sell, chat, and track orders in {country}.
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push("/auth/login")}
          >
            <Text style={styles.primaryBtnText}>Sign in</Text>
          </Pressable>
          <Pressable
            style={styles.linkBtn}
            onPress={() => router.push("/auth/register")}
          >
            <Text style={styles.linkBtnText}>Create an account</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.list}>
        {LINKS.map((item) => (
          <Pressable
            key={item.href}
            style={styles.row}
            onPress={() => router.push(item.href as any)}
          >
            <View style={styles.rowLeft}>
              <Feather name={item.icon} size={18} color="#0F172A" />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                {item.sub ? (
                  <Text style={styles.rowSub}>{item.sub}</Text>
                ) : null}
              </View>
            </View>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </Pressable>
        ))}
      </View>

      {user && token ? (
        <Pressable style={styles.signOut} onPress={() => logout()}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      ) : null}
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
  profileRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0B3D2E",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 22, fontWeight: "900" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  verified: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#D1FAE5",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  verifiedText: { fontSize: 11, fontWeight: "800", color: "#047857" },
  email: { fontSize: 14, color: "#475569" },
  meta: { fontSize: 13, color: "#94A3B8" },
  muted: { fontSize: 14, color: "#64748B", lineHeight: 20 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  tiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  tile: {
    width: "48%",
    minHeight: 76,
    borderRadius: 14,
    padding: 12,
    gap: 8,
    justifyContent: "center",
  },
  tileLabel: { fontSize: 13, fontWeight: "800" },
  primaryBtn: {
    marginTop: 10,
    height: 48,
    borderRadius: 999,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    gap: 8,
  },
  rowLeft: { flexDirection: "row", alignItems: "flex-start", gap: 12, flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  rowSub: { fontSize: 12, color: "#64748B", marginTop: 2 },
  signOut: {
    marginTop: 16,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  signOutText: { color: "#B91C1C", fontWeight: "800" },
});
