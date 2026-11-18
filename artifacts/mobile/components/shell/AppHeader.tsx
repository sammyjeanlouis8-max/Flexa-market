import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { PixelRatio, Platform, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useNavigationChrome } from "@/context/NavigationContext";

type Props = {
  title?: string;
  showBrand?: boolean;
  showBack?: boolean;
  /** When set with showBack, called instead of router.back(). */
  onBack?: () => void;
  showMenu?: boolean;
  showBell?: boolean;
  showCart?: boolean;
  showProfile?: boolean;
  rightExtra?: React.ReactNode;
  /** Marketplace chrome: green (default) or white Messages/inbox style. */
  variant?: "green" | "light";
  /** Unread notifications for the bell badge (light header uses red). */
  bellBadge?: number;
};

/** Typical Android status-bar content height in density-independent pixels. */
const ANDROID_STATUS_DP = 24;

/**
 * Top inset for the chrome — apply once (no outer SafeAreaView).
 *
 * Android note: `StatusBar.currentHeight` is in **physical pixels**, while
 * `useSafeAreaInsets()` and style padding are in **dp**. Mixing them made a
 * "63px" cap apply as 63dp (~165px) and recreated the tall empty green gap.
 * Convert status height to dp, then cap to a normal status-bar height so tall
 * cutout/statusBars frames do not inflate the toolbar.
 */
function useHeaderTopInset(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS === "android") {
    const statusPx = StatusBar.currentHeight ?? 0;
    const statusDp = statusPx > 0 ? statusPx / PixelRatio.get() : 0;
    const raw = statusDp > 0 ? Math.min(insets.top || statusDp, statusDp) : insets.top;
    return Math.min(raw || ANDROID_STATUS_DP, ANDROID_STATUS_DP);
  }
  return insets.top;
}

export function AppHeader({
  title,
  showBrand = true,
  showBack = false,
  onBack,
  showMenu = true,
  showBell = true,
  showCart = true,
  showProfile = true,
  rightExtra,
  variant = "green",
  bellBadge = 0,
}: Props) {
  const topInset = useHeaderTopInset();
  const router = useRouter();
  const { token } = useAuth();
  const { count } = useCart();
  const { openDrawer } = useNavigationChrome();
  const light = variant === "light";
  const iconColor = light ? "#0F172A" : "#FFFFFF";
  const brandColor = light ? "#0F172A" : "#FFFFFF";
  const bg = light ? "#FFFFFF" : colors.flexaGreen;

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <View
      style={[styles.wrap, { paddingTop: topInset, backgroundColor: bg }, light && styles.wrapLight]}
      testID="app-header"
    >
      <StatusBar
        barStyle={light ? "dark-content" : "light-content"}
        backgroundColor={bg}
        translucent={Platform.OS === "android"}
      />
      <View style={styles.bar}>
        <View style={styles.left}>
          {showBack ? (
            <Pressable
              onPress={handleBack}
              style={styles.iconBtn}
              accessibilityLabel="Go back"
              testID="app-header-back"
            >
              <Feather name="arrow-left" size={22} color={iconColor} />
            </Pressable>
          ) : showMenu ? (
            <Pressable
              onPress={openDrawer}
              style={styles.iconBtn}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
              testID="nav-hamburger"
            >
              <Feather name="menu" size={22} color={iconColor} />
            </Pressable>
          ) : (
            <View style={styles.iconBtn} />
          )}

          {showBrand ? (
            <View style={styles.brand}>
              <Image
                source={require("../../assets/images/flexa-logo-v2.png")}
                style={styles.logo}
                contentFit="contain"
              />
              <View style={{ minWidth: 0, flexShrink: 1 }}>
                <Text style={[styles.brandTitle, { color: brandColor }]} numberOfLines={1}>
                  {title || "Flexa Market"}
                </Text>
              </View>
            </View>
          ) : title ? (
            <Text style={[styles.pageTitle, { color: brandColor }]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>

        <View style={styles.right}>
          {rightExtra}
          {showProfile ? (
            <Pressable
              onPress={() => router.push(token ? "/profile" : "/auth/login")}
              style={styles.iconBtn}
              accessibilityLabel="Account"
            >
              <Feather name="user" size={20} color={iconColor} />
            </Pressable>
          ) : null}
          {showBell ? (
            <Pressable
              onPress={() => router.push(token ? "/notifications" : "/auth/login")}
              style={styles.iconBtn}
              accessibilityLabel="Notifications"
              testID="nav-bell"
            >
              <Feather name="bell" size={20} color={iconColor} />
              {bellBadge > 0 ? (
                <View style={[styles.badge, light ? styles.badgeRed : styles.badgeOrange]}>
                  <Text style={styles.badgeText}>
                    {bellBadge > 99 ? "99+" : String(bellBadge)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          {showCart ? (
            <Pressable
              onPress={() => router.push("/cart")}
              style={styles.iconBtn}
              accessibilityLabel="Cart"
              testID="nav-cart"
            >
              <Feather name="shopping-cart" size={20} color={iconColor} />
              {count > 0 ? (
                <View style={[styles.badge, light ? styles.badgeRed : styles.badgeOrange]}>
                  <Text style={styles.badgeText}>{count > 99 ? "99+" : String(count)}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.flexaGreen,
  },
  wrapLight: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  // Compact toolbar — matches mobile-web chrome height under the status bar.
  bar: {
    height: 48,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  left: { flexDirection: "row", alignItems: "center", flex: 1, gap: 2, minWidth: 0 },
  right: { flexDirection: "row", alignItems: "center" },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, minWidth: 0 },
  logo: { width: 26, height: 26, borderRadius: 7 },
  brandTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
    maxWidth: 120,
  },
  pageTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", marginLeft: 2, flexShrink: 1 },
  badge: {
    position: "absolute",
    top: 4,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeOrange: { backgroundColor: colors.flexaOrange },
  badgeRed: { backgroundColor: "#EF4444" },
  badgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
});
