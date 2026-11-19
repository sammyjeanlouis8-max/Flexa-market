import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { LANGUAGES, useLanguage } from "@/context/LanguageContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useNavigationChrome } from "@/context/NavigationContext";
import { useTheme } from "@/context/ThemeContext";
import { apiRequest } from "@/lib/request";
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

type DriverStatus = "loading" | "none" | "pending" | "approved" | "rejected" | "suspended";

/** Haiti-only FM delivery links — matches web `canShowFMDeliveryLinks`. */
function canShowFMDeliveryLinks(country: string | null | undefined): boolean {
  return country === "Haiti";
}

/** WebView `PremiumSideMenu` apply-row labels by driver application status. */
function driverApplyLabel(status: DriverStatus): string {
  switch (status) {
    case "pending":
      return "Application Pending";
    case "approved":
      return "My Driver Profile";
    case "rejected":
      return "Application Rejected";
    case "suspended":
      return "Account Suspended";
    default:
      return "Apply as Driver";
  }
}

function isPathActive(pathname: string, href: string): boolean {
  const path = pathname.split("?")[0] || "/";
  if (href === "/" || href === "/(tabs)" || href === "/(tabs)/") {
    return path === "/" || path === "/(tabs)" || path === "/(tabs)/index" || path.endsWith("/index");
  }
  const base = href.split("?")[0];
  if (base === "/search") {
    if (href.includes("boosted=true")) {
      return path.includes("search") && href.includes("boosted=true");
    }
    // Categories / search without boosted
    return (path.includes("/search") || path.endsWith("/search")) && !pathname.includes("boosted=true");
  }
  if (path === base || path.startsWith(`${base}/`)) return true;
  // Expo tabs / aliases
  if ((base === "/favorites" || base === "/saved") && path.includes("favorites")) return true;
  if (
    (base === "/my-boosts" || base === "/booster") &&
    (path.includes("my-boosts") || path.includes("boost") || path.includes("booster"))
  ) {
    return true;
  }
  if ((base === "/shop" || base.startsWith("/profile/")) && (path.includes("/shop/") || path.includes("/profile/"))) {
    return true;
  }
  if (base.includes("driver") || base.includes("delivery")) {
    if (path.includes("driver") || path.includes("delivery")) return true;
  }
  return false;
}

function goPath(router: ReturnType<typeof useRouter>, href: string) {
  router.push(href as any);
}

export function AppDrawer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { user, token, logout } = useAuth();
  const { country } = useMarketplace();
  const { lang, setLang } = useLanguage();
  const { isDark, toggleDark } = useTheme();
  const { drawerOpen, closeDrawer } = useNavigationChrome();
  const [promoTotal, setPromoTotal] = useState<number | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const [driverStatus, setDriverStatus] = useState<DriverStatus>("none");

  const sheetWidth = Math.min(width * 0.92, 360);
  const langMeta = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES.find((l) => l.code === "en");
  const deliveryCountry = user?.country ?? country;

  useEffect(() => {
    if (!drawerOpen) {
      setLangOpen(false);
      return;
    }
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeDrawer();
      return true;
    });
    return () => sub.remove();
  }, [drawerOpen, closeDrawer]);

  useEffect(() => {
    if (!drawerOpen || !token) {
      setPromoTotal(null);
      return;
    }
    let cancelled = false;
    fetchWalletBalance({ token })
      .then((b) => {
        if (!cancelled) {
          setPromoTotal(Number(b.promoBalance || 0) + Number(b.availableUsd || 0));
        }
      })
      .catch(() => {
        if (!cancelled) setPromoTotal(null);
      });
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, token]);

  // Match web `useDriverStatus` for Delivery & Services labels / My Deliveries.
  useEffect(() => {
    if (!user || !token || !canShowFMDeliveryLinks(deliveryCountry)) {
      setDriverStatus("none");
      return;
    }
    let cancelled = false;
    setDriverStatus("loading");
    apiRequest<{ driver?: { status?: string }; application?: { status?: string } }>("/delivery/application", {
      token,
    })
      .then((data) => {
        if (cancelled) return;
        if (data.driver?.status === "active") {
          setDriverStatus("approved");
          return;
        }
        const s = data.application?.status;
        if (s === "pending" || s === "approved" || s === "rejected" || s === "suspended") {
          setDriverStatus(s);
          return;
        }
        setDriverStatus("none");
      })
      .catch(() => {
        if (!cancelled) setDriverStatus("none");
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, token, deliveryCountry, drawerOpen]);

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
      // Shop & Products — labels match WebView screenshots; native routes map to existing screens.
      out.push({
        id: "boutique",
        heading: "SHOP & PRODUCTS",
        items: [
          { icon: "shopping-bag", label: "My Shop", href: `/shop/${user.id}`, testID: "drawer-my-shop" },
          { icon: "package", label: "My listings", href: "/my-listings", testID: "drawer-my-products" },
          { icon: "plus-square", label: "Add a product", href: "/sell", testID: "drawer-add-product" },
          { icon: "video", label: "My videos", href: "/my-videos", testID: "drawer-my-videos" },
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

      if (canShowFMDeliveryLinks(deliveryCountry)) {
        const deliveryItems: DrawerItem[] = [
          {
            icon: "truck",
            label: "Available Deliveries",
            href: "/driver-dashboard",
            testID: "drawer-deliveries",
          },
          {
            icon: "user-plus",
            label: driverApplyLabel(driverStatus),
            href: "/driver-apply",
            testID: "drawer-driver-apply",
          },
        ];
        if (driverStatus === "approved") {
          deliveryItems.push({
            icon: "map-pin",
            label: "My Deliveries",
            href: "/driver-dashboard",
            testID: "drawer-my-deliveries",
          });
        }
        deliveryItems.push({
          icon: "search",
          label: "Order tracking",
          href: "/track",
          testID: "drawer-tracking",
        });
        out.push({
          id: "delivery",
          heading: "DELIVERY & SERVICES",
          items: deliveryItems,
        });
      }

      out.push({
        id: "account",
        heading: "MY ACCOUNT",
        items: [
          // Web Profile → /settings
          { icon: "user", label: "Profile", href: "/settings", testID: "drawer-profile" },
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
        items: [{ icon: "user", label: "Sign In", href: "/auth/login", testID: "drawer-login" }],
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
              { icon: "zap", label: "My Active Boosts", href: "/my-boosts", testID: "drawer-my-boosts" },
              { icon: "percent", label: "Commission Promo", href: "/commission-promo", testID: "drawer-commission" },
            ] as DrawerItem[])
          : []),
        { icon: "briefcase", label: "Jobs & Opportunities", href: "/jobs", testID: "drawer-jobs" },
        ...(user
          ? ([{ icon: "award", label: "Referral Program", href: "/leaderboard", testID: "drawer-referral" }] as DrawerItem[])
          : []),
        { icon: "star", label: "FlexaBot AI", href: "/chatbot", testID: "drawer-chatbot" },
        { icon: "help-circle", label: "Support & Help", href: "/support", testID: "drawer-support" },
      ],
    });

    // Financial Support is hidden on WebView native-mobile shell — keep parity.
    // (Web: `!isNativeMobileApp() && Haiti|DR|superAdmin`)

    // Flexa Control — staff only (support+). Gate matches server /admin/me.
    {
      const role = String(user?.role ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
      const staff =
        !!(
          user?.isAdmin ||
          user?.isSuperAdmin ||
          role === "superadmin" ||
          role === "admin" ||
          role === "moderator" ||
          role === "support"
        );
      if (staff) {
        out.push({
          id: "admin",
          heading: "ADMIN",
          items: [
            {
              icon: "shield",
              label: "Flexa Control",
              href: "/admin",
              testID: "drawer-admin",
            },
            ...(user?.isAdmin ||
            user?.isSuperAdmin ||
            role === "moderator" ||
            role === "admin" ||
            role === "superadmin"
              ? ([
                  {
                    icon: "flag",
                    label: "Moderator Panel",
                    href: "/admin/moderation",
                    testID: "drawer-moderator",
                  },
                ] as DrawerItem[])
              : []),
          ],
        });
      }
    }

    return out;
  }, [user, deliveryCountry, driverStatus]);

  const normalizedRole = String(user?.role ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  const roleLabel = user?.isSuperAdmin || normalizedRole === "superadmin"
    ? "Super Admin"
    : user?.isAdmin || normalizedRole === "admin"
      ? "Admin"
      : normalizedRole === "moderator"
        ? "Moderator"
        : normalizedRole === "support"
          ? "Support"
          : user?.role && user.role !== "user"
            ? user.role
            : "Member";

  const onNavigate = (href: string) => {
    closeDrawer();
    setTimeout(() => goPath(router, href), 80);
  };

  if (!drawerOpen) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable
        style={styles.backdrop}
        onPress={closeDrawer}
        testID="premium-menu-backdrop"
        accessibilityLabel="Close menu backdrop"
      />
      <View
        style={[styles.sheet, { width: sheetWidth, paddingTop: insets.top }]}
        testID="premium-side-menu"
      >
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
            <Pressable
              onPress={closeDrawer}
              style={styles.closeBtn}
              accessibilityLabel="Close menu"
              testID="premium-menu-close"
            >
              <Feather name="x" size={16} color="#FFFFFF" />
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
              <Pressable
                style={styles.promoBtn}
                onPress={() => onNavigate("/wallet?tab=promo")}
                testID="drawer-promo-balance"
              >
                <Feather name="gift" size={14} color="#6EE7B7" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.promoLabel}>Promo Account</Text>
                  <Text style={styles.promoValue}>
                    ${promoTotal != null ? promoTotal.toFixed(2) : "—"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.5)" />
              </Pressable>
            </View>
          ) : null}
        </View>

        <ScrollView
          style={{ flex: 1, backgroundColor: "#F8FAFC" }}
          contentContainerStyle={{
            paddingHorizontal: 10,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16) + 16,
            gap: 12,
          }}
          showsVerticalScrollIndicator={false}
          testID="premium-menu-scroll"
        >
          {sections.map((section) => (
            <View key={section.id} style={styles.sectionBlock} testID={`drawer-section-${section.id}`}>
              <Text style={styles.sectionHeading}>{section.heading}</Text>
              <View style={styles.sectionCard}>
                {section.items.map((item, idx) => {
                  const active = isPathActive(pathname, item.href);
                  return (
                    <Pressable
                      key={`${section.id}-${item.testID ?? item.label}`}
                      style={({ pressed }) => [
                        styles.row,
                        idx > 0 && styles.rowDivider,
                        active && styles.rowActive,
                        pressed && !active && { backgroundColor: "rgba(20,108,67,0.06)" },
                      ]}
                      onPress={() => onNavigate(item.href)}
                      testID={item.testID}
                      accessibilityState={{ selected: active }}
                    >
                      {active ? <View style={styles.activeBar} /> : null}
                      <View style={[styles.iconBox, active && styles.iconBoxActive]}>
                        <Feather
                          name={item.icon}
                          size={14}
                          color={active ? colors.flexaGreenDeep : "#64748B"}
                        />
                      </View>
                      <Text style={[styles.rowLabel, active && styles.rowLabelActive]} numberOfLines={1}>
                        {item.label}
                      </Text>
                      <Feather
                        name="chevron-right"
                        size={14}
                        color={active ? colors.flexaGreen : "#CBD5E1"}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          <View style={styles.sectionBlock} testID="drawer-section-preferences">
            <Text style={styles.sectionHeading}>PREFERENCES</Text>
            <View style={styles.sectionCard}>
              <Pressable
                style={styles.row}
                onPress={() => setLangOpen((v) => !v)}
                testID="drawer-lang-toggle"
              >
                <View style={styles.iconBox}>
                  <Feather name="globe" size={14} color="#64748B" />
                </View>
                <Text style={styles.rowLabel}>Language</Text>
                <Text style={styles.langMeta}>
                  {langMeta?.flag} {langMeta?.label === "English" || langMeta?.code === "en" ? "English" : langMeta?.native}
                </Text>
                <Feather
                  name="chevron-right"
                  size={14}
                  color="#CBD5E1"
                  style={{ transform: [{ rotate: langOpen ? "90deg" : "0deg" }] }}
                />
              </Pressable>
              {langOpen ? (
                <View style={styles.langPicker}>
                  {LANGUAGES.map((l) => (
                    <Pressable
                      key={l.code}
                      style={[styles.langOption, lang === l.code && styles.langOptionActive]}
                      onPress={async () => {
                        await setLang(l.code);
                        setLangOpen(false);
                        closeDrawer();
                      }}
                      testID={`drawer-lang-${l.code}`}
                    >
                      <Text style={styles.langOptionFlag}>{l.flag}</Text>
                      <Text style={styles.langOptionName}>{l.native}</Text>
                      {lang === l.code ? (
                        <Text style={styles.langCheck}>✓</Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={[styles.row, styles.rowDivider]}>
                <View style={styles.iconBox}>
                  <Feather name={isDark ? "sun" : "moon"} size={14} color="#64748B" />
                </View>
                <Text style={styles.rowLabel}>Dark Mode</Text>
                <Switch
                  testID="btn-dark-mode-toggle"
                  value={isDark}
                  onValueChange={() => toggleDark()}
                  trackColor={{ false: "#E2E8F0", true: colors.flexaGreen }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>
          </View>

          {user ? (
            <Pressable
              style={styles.logout}
              testID="drawer-logout"
              onPress={async () => {
                closeDrawer();
                await logout();
                router.replace("/");
              }}
            >
              <Feather name="log-out" size={16} color="#EF4444" />
              <Text style={styles.logoutText}>Sign out</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
    flexDirection: "row",
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    height: "100%",
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
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
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
  sectionBlock: { gap: 4 },
  sectionHeading: {
    color: "hsl(152, 55%, 28%)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginLeft: 8,
    marginBottom: 2,
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(226,232,240,0.95)",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  row: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 40,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(226,232,240,0.9)",
  },
  rowActive: {
    backgroundColor: "hsla(152, 45%, 92%, 1)",
  },
  activeBar: {
    position: "absolute",
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
    backgroundColor: "hsl(152, 65%, 28%)",
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBoxActive: {
    backgroundColor: "hsla(152, 55%, 88%, 1)",
  },
  rowLabel: { flex: 1, fontSize: 13, color: "#0F172A", fontWeight: "500" },
  rowLabelActive: { fontWeight: "700", color: "hsl(152, 65%, 18%)" },
  langMeta: { fontSize: 11, color: "#64748B", marginRight: 2 },
  langPicker: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(226,232,240,0.9)",
    backgroundColor: "#F8FAFC",
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 2,
  },
  langOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  langOptionActive: {
    backgroundColor: "hsla(152, 45%, 92%, 1)",
  },
  langOptionFlag: { fontSize: 16 },
  langOptionName: { flex: 1, fontSize: 13, color: "#0F172A" },
  langCheck: { color: colors.flexaGreen, fontWeight: "800", fontSize: 12 },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  logoutText: { color: "#EF4444", fontSize: 13, fontWeight: "700" },
});
