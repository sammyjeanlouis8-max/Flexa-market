import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useNavigationChrome } from "@/context/NavigationContext";
import { fetchWalletBalance } from "@/lib/walletApi";

type IconName = React.ComponentProps<typeof Feather>["name"];

type DrawerItem = {
  icon: IconName;
  label: string;
  href: string;
  testID?: string;
};

type DrawerSection = {
  id: string;
  heading: string;
  items: DrawerItem[];
};

function goPath(router: ReturnType<typeof useRouter>, href: string) {
  if (href.startsWith("/search?")) {
    router.push(href as any);
    return;
  }
  router.push(href as any);
}

export function AppDrawer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token, logout } = useAuth();
  const { drawerOpen, closeDrawer } = useNavigationChrome();
  const [promoTotal, setPromoTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!drawerOpen || !token) {
      setPromoTotal(null);
      return;
    }
    let cancelled = false;
    fetchWalletBalance({ token })
      .then((b) => {
        if (!cancelled) setPromoTotal(Number(b.promoBalance || 0) + Number(b.availableUsd || 0));
      })
      .catch(() => {
        if (!cancelled) setPromoTotal(null);
      });
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, token]);

  const sections: DrawerSection[] = useMemo(() => {
    const discover: DrawerSection = {
      id: "discover",
      heading: "HOME & DISCOVER",
      items: [
        { icon: "home", label: "Home", href: "/", testID: "drawer-home" },
        { icon: "grid", label: "Categories", href: "/search", testID: "drawer-categories" },
        { icon: "tag", label: "Offers & Promotions", href: "/offers", testID: "drawer-offers" },
        { icon: "star", label: "Flexa Picks", href: "/search?boosted=true", testID: "drawer-flexa-picks" },
        { icon: "film", label: "Promotional Videos", href: "/videos", testID: "drawer-promo-videos" },
      ],
    };

    const out: DrawerSection[] = [discover];

    if (user) {
      out.push({
        id: "boutique",
        heading: "SHOP & PRODUCTS",
        items: [
          { icon: "shopping-bag", label: "My Shop", href: `/shop/${user.id}`, testID: "drawer-my-shop" },
          { icon: "package", label: "My listings", href: "/my-listings", testID: "drawer-my-products" },
          { icon: "plus-square", label: "Add a product", href: "/sell", testID: "drawer-add-product" },
          { icon: "video", label: "My videos", href: "/videos", testID: "drawer-my-videos" },
          { icon: "zap", label: "My Active Boosts", href: "/my-boosts", testID: "drawer-shop-my-boosts" },
          { icon: "bar-chart-2", label: "Boost Analytics", href: "/boost-analytics", testID: "drawer-boost-analytics" },
          { icon: "settings", label: "Shop settings", href: "/settings", testID: "drawer-shop-settings" },
        ],
      });
      out.push({
        id: "orders",
        heading: "ORDERS & SALES",
        items: [
          { icon: "shopping-bag", label: "My Orders", href: "/orders", testID: "drawer-orders" },
          { icon: "trending-up", label: "My Sales & Statistics", href: "/sales", testID: "drawer-sales" },
          { icon: "help-circle", label: "Returns & Refunds", href: "/support", testID: "drawer-returns" },
          { icon: "award", label: "Reviews & Ratings", href: `/shop/${user.id}`, testID: "drawer-reviews" },
        ],
      });
      out.push({
        id: "delivery",
        heading: "DELIVERY",
        items: [
          { icon: "truck", label: "Available deliveries", href: "/driver-dashboard", testID: "drawer-deliveries" },
          { icon: "user-plus", label: "Apply as driver", href: "/driver-apply", testID: "drawer-driver-apply" },
          { icon: "map-pin", label: "Order tracking", href: "/track", testID: "drawer-tracking" },
        ],
      });
      out.push({
        id: "account",
        heading: "MY ACCOUNT",
        items: [
          { icon: "user", label: "Profile", href: "/profile", testID: "drawer-profile" },
          { icon: "heart", label: "Saved", href: "/favorites", testID: "drawer-saved" },
          { icon: "file-text", label: "My Drafts", href: "/my-drafts", testID: "drawer-my-drafts" },
          { icon: "credit-card", label: "Wallet", href: "/wallet", testID: "drawer-wallet" },
          { icon: "gift", label: "Promo Account", href: "/wallet?tab=promo", testID: "drawer-promo-account" },
          { icon: "award", label: "Subscription", href: "/subscription", testID: "drawer-subscription" },
          { icon: "settings", label: "Settings", href: "/settings", testID: "drawer-settings" },
          { icon: "lock", label: "Security & Login", href: "/settings/security", testID: "drawer-security" },
          { icon: "bell", label: "Notifications", href: "/settings/notifications", testID: "drawer-notifications" },
        ],
      });
    } else {
      out.push({
        id: "account",
        heading: "MY ACCOUNT",
        items: [{ icon: "log-in", label: "Login", href: "/auth/login", testID: "drawer-login" }],
      });
    }

    out.push({
      id: "services",
      heading: "FLEXA SERVICES",
      items: [
        { icon: "tv", label: "Flexa TV", href: "/tv", testID: "drawer-flexa-tv" },
        { icon: "music", label: "Flexa Music", href: "/music", testID: "drawer-flexa-music" },
        ...(user
          ? ([
              { icon: "zap", label: "My Boosts", href: "/my-boosts", testID: "drawer-my-boosts" },
              { icon: "percent", label: "Commission promo", href: "/commission-promo", testID: "drawer-commission" },
            ] as DrawerItem[])
          : []),
        { icon: "briefcase", label: "Jobs", href: "/jobs", testID: "drawer-jobs" },
        ...(user
          ? ([{ icon: "award", label: "Referral Program", href: "/leaderboard", testID: "drawer-referral" }] as DrawerItem[])
          : []),
        { icon: "message-circle", label: "FlexaBot AI", href: "/chatbot", testID: "drawer-chatbot" },
        { icon: "help-circle", label: "Support", href: "/support", testID: "drawer-support" },
      ],
    });

    out.push({
      id: "financial",
      heading: "FINANCIAL SUPPORT",
      items: [
        { icon: "trending-up", label: "Credit Score", href: "/credit-score", testID: "drawer-credit" },
        { icon: "dollar-sign", label: "Business Loans", href: "/loans", testID: "drawer-loans" },
      ],
    });

    if (user?.isAdmin || user?.isSuperAdmin) {
      out.push({
        id: "admin",
        heading: "ADMIN",
        items: [
          { icon: "shield", label: "Admin Dashboard", href: "/admin", testID: "drawer-admin" },
          { icon: "shield", label: "Moderator Panel", href: "/admin?tab=moderation", testID: "drawer-moderator" },
        ],
      });
    }

    return out;
  }, [user]);

  const roleLabel = user?.isSuperAdmin
    ? "Super Admin"
    : user?.isAdmin
      ? "Admin"
      : user?.role && user.role !== "user"
        ? user.role
        : "Member";

  const onNavigate = (href: string) => {
    closeDrawer();
    setTimeout(() => goPath(router, href), 80);
  };

  return (
    <Modal
      visible={drawerOpen}
      transparent
      animationType="fade"
      onRequestClose={closeDrawer}
      statusBarTranslucent
      presentationStyle="overFullScreen"
      hardwareAccelerated
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={closeDrawer} testID="premium-menu-backdrop" />
        <View style={[styles.sheet, { paddingTop: insets.top }]} testID="premium-side-menu">
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.brandRow}>
                <Image
                  source={require("../../assets/images/flexa-logo-v2.png")}
                  style={styles.logo}
                  contentFit="contain"
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.brandName}>Flexa Market</Text>
                  <Text style={styles.brandTag}>Marketplace · Delivery · Services</Text>
                </View>
              </View>
              <Pressable onPress={closeDrawer} style={styles.closeBtn} accessibilityLabel="Close menu">
                <Feather name="x" size={18} color="#FFFFFF" />
              </Pressable>
            </View>

            {user ? (
              <View style={styles.userCard}>
                <Text style={styles.userName} numberOfLines={1}>
                  {user.name}{" "}
                  {user.kycStatus === "approved" ? (
                    <Text style={styles.verified}>✓</Text>
                  ) : null}
                </Text>
                <Text style={styles.userMeta} numberOfLines={1}>
                  {roleLabel} · ID: FM-{user.id}
                </Text>
                <Pressable style={styles.promoBtn} onPress={() => onNavigate("/wallet")}>
                  <Feather name="gift" size={14} color="#6EE7B7" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.promoLabel}>Promo Account</Text>
                    <Text style={styles.promoValue}>
                      ${promoTotal != null ? promoTotal.toFixed(2) : "—"}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.5)" />
                </Pressable>
              </View>
            ) : null}
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 14 }}
          >
            {sections.map((section) => (
              <View key={section.id} style={styles.section}>
                <Text style={styles.sectionHeading}>{section.heading}</Text>
                {section.items.map((item) => (
                  <Pressable
                    key={`${section.id}-${item.label}`}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && { backgroundColor: "rgba(20,108,67,0.08)" },
                      item.href === "/" && styles.rowActive,
                    ]}
                    onPress={() => onNavigate(item.href)}
                    testID={item.testID}
                  >
                    <Feather name={item.icon} size={18} color={colors.flexaGreen} />
                    <Text style={styles.rowLabel}>{item.label}</Text>
                    <Feather name="chevron-right" size={16} color="#94A3B8" />
                  </Pressable>
                ))}
              </View>
            ))}

            <Pressable
              style={styles.langRow}
              onPress={() => onNavigate("/language-picker")}
            >
              <Feather name="globe" size={18} color={colors.flexaGreen} />
              <Text style={styles.rowLabel}>Language</Text>
              <Feather name="chevron-right" size={16} color="#94A3B8" />
            </Pressable>

            {user ? (
              <Pressable
                style={styles.logout}
                onPress={async () => {
                  closeDrawer();
                  await logout();
                  router.replace("/");
                }}
              >
                <Feather name="log-out" size={18} color="#EF4444" />
                <Text style={styles.logoutText}>Log out</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: "row" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    width: "88%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  header: {
    backgroundColor: colors.flexaGreen,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  headerTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  logo: { width: 32, height: 32, borderRadius: 8 },
  brandName: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  brandTag: { color: "rgba(255,255,255,0.75)", fontSize: 10, marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  userCard: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 12,
  },
  userName: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  verified: { color: "#6EE7B7", fontWeight: "900" },
  userMeta: { color: "rgba(255,255,255,0.7)", fontSize: 10, marginTop: 2 },
  promoBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    backgroundColor: "rgba(15,84,52,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  promoLabel: { color: "rgba(255,255,255,0.7)", fontSize: 10 },
  promoValue: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", marginTop: 2 },
  section: { gap: 2 },
  sectionHeading: {
    color: colors.flexaGreen,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginBottom: 4,
    marginLeft: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  rowActive: { backgroundColor: "rgba(20,108,67,0.1)" },
  rowLabel: { flex: 1, fontSize: 14, color: "#0F172A", fontWeight: "600" },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  logoutText: { color: "#EF4444", fontSize: 14, fontWeight: "700" },
});
