/**
 * Native Settings / My Account hub — matches website `/settings` layout:
 * profile card, 2×2 shortcuts, settings rows, marketplace country (separate
 * from account country), and the shared bottom tab bar with My Account active.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MainTabBar } from "@/components/shell/MainTabBar";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useNavigationChrome } from "@/context/NavigationContext";
import { useTabBarHeight } from "@/hooks/useTabContentInsets";
import { COUNTRY_FLAGS, SUPPORTED_COUNTRIES } from "@/lib/countries";
import { fetchUnreadCount as fetchNotifUnread } from "@/lib/notificationsApi";

type Row = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  iconBg: string;
  iconColor: string;
  onPress: () => void;
  disabled?: boolean;
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tabBarHeight = useTabBarHeight();
  const { openDrawer } = useNavigationChrome();
  const { user, token, logout, refreshUser, isLoading } = useAuth();
  const { count: cartCount } = useCart();
  const { country: marketplaceCountry, setCountry } = useMarketplace();
  const [countryOpen, setCountryOpen] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [notifUnread, setNotifUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (token) void refreshUser();
      if (!token) {
        setNotifUnread(0);
        return;
      }
      let cancelled = false;
      void fetchNotifUnread({ token })
        .then((n) => {
          if (!cancelled) setNotifUnread(n);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [token, refreshUser]),
  );

  const avatarUri = (user?.avatarUrl || user?.avatar || "").trim();
  const initial = (user?.name || "?").trim().charAt(0).toUpperCase() || "F";
  const accountCountry = user?.country || marketplaceCountry || "Haiti";
  const verified = Boolean(user?.isVerified || user?.isPhoneVerified);

  const goSignIn = () => router.push("/auth/login");

  const requireAuth = (fn: () => void) => {
    if (!token || !user) {
      goSignIn();
      return;
    }
    fn();
  };

  const shortcuts = useMemo(
    () =>
      [
        {
          key: "sell",
          label: "Add a product",
          icon: "plus" as const,
          bg: colors.flexaGreen,
          fg: "#FFFFFF",
          onPress: () => requireAuth(() => router.push("/(tabs)/sell")),
        },
        {
          key: "videos",
          label: "My videos (Products)",
          icon: "play-circle" as const,
          bg: "#EEF2FF",
          fg: "#4F46E5",
          onPress: () => requireAuth(() => router.push("/videos")),
        },
        {
          key: "boosts",
          label: "Booster (My boosts)",
          icon: "volume-2" as const,
          bg: "#FFF7ED",
          fg: "#C2410C",
          onPress: () => requireAuth(() => router.push("/my-boosts")),
        },
        {
          key: "drafts",
          label: "My Drafts",
          icon: "layers" as const,
          bg: "#F5F3FF",
          fg: "#6D28D9",
          badge: "NEW",
          onPress: () =>
            requireAuth(() => {
              // Drafts are saved/restored on the native Sell screen.
              router.push("/(tabs)/sell");
            }),
        },
      ] as const,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, user, router],
  );

  const rows: Row[] = useMemo(() => {
    const list: Row[] = [
      {
        key: "identity",
        title: "Profile & Identity",
        subtitle: "Personal information, country, verification",
        icon: "user",
        iconBg: "#DBEAFE",
        iconColor: "#2563EB",
        onPress: () => requireAuth(() => router.push("/edit-profile")),
      },
      {
        key: "security",
        title: "Security & Login",
        subtitle: "Password, 2FA, devices, sessions",
        icon: "shield",
        iconBg: "#EDE9FE",
        iconColor: "#7C3AED",
        onPress: () =>
          requireAuth(() => {
            Alert.alert(
              "Security & Login",
              "Change your password from Edit profile. Two-factor and device sessions stay on the website for now.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Edit profile", onPress: () => router.push("/edit-profile") },
              ],
            );
          }),
      },
      {
        key: "addresses",
        title: "Delivery addresses",
        subtitle: "Saved addresses reused automatically at checkout",
        icon: "map-pin",
        iconBg: "#DBEAFE",
        iconColor: "#2563EB",
        onPress: () => requireAuth(() => router.push("/addresses")),
      },
      {
        key: "payments",
        title: "Payments & Withdrawals",
        subtitle: "Stripe, MonCash, withdrawals, transactions",
        icon: "credit-card",
        iconBg: "#DCFCE7",
        iconColor: "#15803D",
        disabled: true,
        onPress: () => setPaymentsOpen(true),
      },
      {
        key: "listings",
        title: "My listings",
        subtitle: "Items for sale, management, statistics",
        icon: "tag",
        iconBg: "#FEF3C7",
        iconColor: "#D97706",
        onPress: () => requireAuth(() => router.push("/my-listings")),
      },
      {
        key: "boosts-row",
        title: "My boosts",
        subtitle: "Sponsored campaigns and budgets",
        icon: "zap",
        iconBg: "#FFEDD5",
        iconColor: "#EA580C",
        onPress: () => requireAuth(() => router.push("/my-boosts")),
      },
      {
        key: "videos-row",
        title: "My videos",
        subtitle: "Uploaded, product, and promotional videos",
        icon: "video",
        iconBg: "#E0E7FF",
        iconColor: "#4338CA",
        onPress: () => requireAuth(() => router.push("/videos")),
      },
      {
        key: "notifications",
        title: "Notifications",
        subtitle: "Messages, orders, promotions",
        icon: "bell",
        iconBg: "#FEE2E2",
        iconColor: "#DC2626",
        onPress: () => requireAuth(() => router.push("/notifications")),
      },
      {
        key: "language",
        title: "Language",
        subtitle: "Display language, app language",
        icon: "globe",
        iconBg: "#DCFCE7",
        iconColor: "#15803D",
        onPress: () => router.push("/language-picker"),
      },
      {
        key: "marketplace-country",
        title: "Marketplace country",
        subtitle: `Browse as ${marketplaceCountry} (separate from account country)`,
        icon: "map",
        iconBg: "#E0F2FE",
        iconColor: "#0284C7",
        onPress: () => setCountryOpen(true),
      },
      {
        key: "help",
        title: "Help & Support",
        subtitle: "FAQ, contact support",
        icon: "help-circle",
        iconBg: "#E0F2FE",
        iconColor: "#0369A1",
        onPress: () => router.push("/support"),
      },
    ];

    if (user?.isAdmin || user?.isSuperAdmin) {
      list.push({
        key: "admin",
        title: "Admin panel",
        subtitle: "Manage users and listings",
        icon: "tool",
        iconBg: "#F1F5F9",
        iconColor: "#0F172A",
        onPress: () => requireAuth(() => router.push("/admin")),
      });
    }

    if (token && user) {
      list.push({
        key: "logout",
        title: "Log out",
        subtitle: "Sign out of this device",
        icon: "log-out",
        iconBg: "#FEE2E2",
        iconColor: "#B91C1C",
        onPress: () => {
          Alert.alert("Log out", "Sign out of Flexa Market on this device?", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Log out",
              style: "destructive",
              onPress: () => {
                void logout().then(() => router.replace("/(tabs)/profile"));
              },
            },
          ]);
        },
      });
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, marketplaceCountry, router, logout]);

  return (
    <View style={styles.root} testID="settings-screen">
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable
              style={styles.headerIcon}
              onPress={openDrawer}
              accessibilityLabel="Open menu"
            >
              <Feather name="menu" size={22} color="#0F172A" />
            </Pressable>
            <Pressable
              style={styles.headerIcon}
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace("/(tabs)/profile")
              }
              accessibilityLabel="Go back"
            >
              <Feather name="arrow-left" size={22} color="#0F172A" />
            </Pressable>
            <Text style={styles.headerTitle}>Settings</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              style={styles.headerIcon}
              onPress={() => router.push(token ? "/(tabs)/profile" : "/auth/login")}
              accessibilityLabel="Profile"
            >
              <Feather name="user" size={20} color="#0F172A" />
            </Pressable>
            <Pressable
              style={styles.headerIcon}
              onPress={() => router.push("/notifications")}
              accessibilityLabel="Notifications"
            >
              <Feather name="bell" size={20} color="#0F172A" />
              {notifUnread > 0 ? (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {notifUnread > 99 ? "99+" : String(notifUnread)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              style={styles.headerIcon}
              onPress={() => router.push("/(tabs)/cart")}
              accessibilityLabel="Cart"
            >
              <Feather name="shopping-cart" size={20} color="#0F172A" />
              {cartCount > 0 ? (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {cartCount > 99 ? "99+" : String(cartCount)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: tabBarHeight + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          {isLoading || (token && !user) ? (
            <Text style={styles.muted}>Loading account…</Text>
          ) : user && token ? (
            <>
              <View style={styles.profileTop}>
                <View style={styles.avatarWrap}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarLetter}>{initial}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.profileMeta}>
                  <Text style={styles.profileName} numberOfLines={1}>
                    {user.name}
                  </Text>
                  <Text style={styles.profileEmail} numberOfLines={1}>
                    {user.email}
                  </Text>
                  {verified ? (
                    <View style={styles.verifiedPill}>
                      <Feather name="check" size={12} color="#15803D" />
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  ) : (
                    <Pressable onPress={() => router.push("/kyc")}>
                      <Text style={styles.verifyLink}>Verify account</Text>
                    </Pressable>
                  )}
                </View>
                <Pressable
                  style={styles.pencil}
                  onPress={() => router.push("/edit-profile")}
                  accessibilityLabel="Edit profile"
                >
                  <Feather name="edit-2" size={16} color="#0F172A" />
                </Pressable>
              </View>
              <View style={styles.countryRow}>
                <Text style={styles.countryFlag}>
                  {COUNTRY_FLAGS[accountCountry] ?? "🌍"}
                </Text>
                <Text style={styles.countryLabel}>
                  Account country: <Text style={styles.countryValue}>{accountCountry}</Text>
                </Text>
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    Alert.alert(
                      "Account country",
                      "Your account country comes from your Flexa profile and drives wallet checkout rules. Marketplace browse country is separate below.",
                    )
                  }
                  accessibilityLabel="Account country info"
                >
                  <Feather name="info" size={16} color="#94A3B8" />
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.profileName}>Welcome to Flexa Market</Text>
              <Text style={styles.muted}>
                Sign in to manage your profile, listings, and settings.
              </Text>
              <Pressable style={styles.signInBtn} onPress={goSignIn}>
                <Text style={styles.signInBtnText}>Sign in</Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.shortcutGrid}>
          {shortcuts.map((s) => (
            <Pressable
              key={s.key}
              style={[styles.shortcut, { backgroundColor: s.bg }]}
              onPress={s.onPress}
            >
              {"badge" in s && s.badge ? (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>{s.badge}</Text>
                </View>
              ) : null}
              <Feather name={s.icon} size={22} color={s.fg} />
              <Text style={[styles.shortcutLabel, { color: s.fg }]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.listCard}>
          {rows.map((row, idx) => (
            <Pressable
              key={row.key}
              style={[
                styles.listRow,
                idx < rows.length - 1 && styles.listRowBorder,
                row.disabled && styles.listRowDisabled,
              ]}
              onPress={row.onPress}
              accessibilityState={{ disabled: !!row.disabled }}
            >
              <View style={[styles.rowIcon, { backgroundColor: row.iconBg }]}>
                <Feather name={row.icon} size={18} color={row.iconColor} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <Text style={styles.rowSub} numberOfLines={2}>
                  {row.subtitle}
                </Text>
              </View>
              <Feather
                name="chevron-right"
                size={18}
                color={row.disabled ? "#CBD5E1" : "#94A3B8"}
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={styles.tabDock}>
        <MainTabBar active="account" />
      </View>

      <Modal
        visible={paymentsOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setPaymentsOpen(false)}
      >
        <Pressable style={[styles.backdrop, styles.paymentsBackdrop]} onPress={() => setPaymentsOpen(false)}>
          <View style={styles.paymentsCard}>
            <Text style={styles.sheetTitle}>Unavailable on Android</Text>
            <Text style={styles.sheetHint}>
              Wallet top-ups, card recharge, and withdrawals stay blocked on Android
              (Play digital goods policy). Use wallet balance for Haiti cart checkout
              where available.
            </Text>
            <Pressable style={styles.signInBtn} onPress={() => setPaymentsOpen(false)}>
              <Text style={styles.signInBtnText}>OK</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={countryOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCountryOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setCountryOpen(false)}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.sheetTitle}>Marketplace country</Text>
            <Text style={styles.sheetHint}>
              Guests browse listings for this country. Your account country stays{" "}
              {accountCountry}.
            </Text>
            <FlatList
              data={SUPPORTED_COUNTRIES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.countryPickRow}
                  onPress={async () => {
                    await setCountry(item);
                    setCountryOpen(false);
                  }}
                >
                  <Text style={styles.flagEmoji}>{COUNTRY_FLAGS[item]}</Text>
                  <Text style={styles.countryName}>{item}</Text>
                  {item === marketplaceCountry ? (
                    <Feather name="check" size={18} color={colors.flexaOrange} />
                  ) : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 1 },
  headerRight: { flexDirection: "row", alignItems: "center" },
  headerIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    marginLeft: 2,
  },
  notifBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  notifBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  scroll: { flex: 1 },
  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginBottom: 12,
  },
  profileTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatarWrap: { width: 56, height: 56 },
  avatarImg: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  profileMeta: { flex: 1, minWidth: 0, gap: 2 },
  profileName: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  profileEmail: { fontSize: 13, color: "#64748B" },
  verifiedPill: {
    alignSelf: "flex-start",
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  verifiedText: { fontSize: 12, fontWeight: "700", color: "#15803D" },
  verifyLink: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: colors.flexaOrange,
  },
  pencil: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  countryRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  countryFlag: { fontSize: 16 },
  countryLabel: { flex: 1, fontSize: 13, color: "#475569" },
  countryValue: { fontWeight: "800", color: "#0F172A" },
  muted: { fontSize: 14, color: "#64748B", lineHeight: 20, marginTop: 4 },
  signInBtn: {
    marginTop: 12,
    height: 44,
    borderRadius: 999,
    backgroundColor: colors.flexaOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  signInBtnText: { color: "#fff", fontWeight: "800" },
  shortcutGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  shortcut: {
    width: "48%",
    flexGrow: 1,
    minHeight: 88,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: "space-between",
    gap: 10,
    overflow: "hidden",
  },
  shortcutLabel: { fontSize: 13, fontWeight: "800", lineHeight: 17 },
  newBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#EF4444",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 1,
  },
  newBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  listCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    marginBottom: 8,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  listRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  listRowDisabled: { opacity: 0.72 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  rowSub: { fontSize: 12, color: "#94A3B8", marginTop: 2, lineHeight: 16 },
  tabDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.4)",
  },
  paymentsBackdrop: {
    justifyContent: "center",
  },
  sheet: {
    maxHeight: "70%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  sheetHint: {
    fontSize: 13,
    color: "#64748B",
    paddingHorizontal: 20,
    marginBottom: 8,
    lineHeight: 18,
  },
  paymentsCard: {
    marginHorizontal: 28,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 8,
  },
  countryPickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  flagEmoji: { fontSize: 22 },
  countryName: { flex: 1, fontSize: 16, color: "#0F172A" },
});
