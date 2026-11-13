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
  showMenu?: boolean;
  showBell?: boolean;
  showCart?: boolean;
  showProfile?: boolean;
  rightExtra?: React.ReactNode;
};

/** Typical Android status-bar content height (dp). Tall cutout/statusBars
 * insets on some devices/emulators report ~48dp+ and leave empty green
 * under the clock — cap chrome padding to this instead. */
const ANDROID_STATUS_DP = 24;

/**
 * Top inset for the green chrome — apply once (no outer SafeAreaView).
 * Android: never pad by the full display-cutout / statusBars frame when it
 * exceeds a normal status-bar height; green still draws edge-to-edge via
 * translucent StatusBar. iOS keeps true safe-area top (notch / Dynamic Island).
 */
function useHeaderTopInset(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS === "android") {
    const statusPx = StatusBar.currentHeight ?? 0;
    const capPx = Math.round(PixelRatio.get() * ANDROID_STATUS_DP);
    // Prefer the smaller of safe-area top and StatusBar height, then hard-cap.
    // On cutout emulators both can be ~128px while icons only occupy ~24dp.
    const raw = statusPx > 0 ? Math.min(insets.top || statusPx, statusPx) : insets.top;
    return Math.min(raw || capPx, capPx);
  }
  return insets.top;
}

export function AppHeader({
  title,
  showBrand = true,
  showBack = false,
  showMenu = true,
  showBell = true,
  showCart = true,
  showProfile = true,
  rightExtra,
}: Props) {
  const topInset = useHeaderTopInset();
  const router = useRouter();
  const { token } = useAuth();
  const { count } = useCart();
  const { openDrawer } = useNavigationChrome();

  return (
    <View style={[styles.wrap, { paddingTop: topInset }]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={colors.flexaGreen}
        translucent={Platform.OS === "android"}
      />
      <View style={styles.bar}>
        <View style={styles.left}>
          {showBack ? (
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
              style={styles.iconBtn}
              accessibilityLabel="Go back"
            >
              <Feather name="arrow-left" size={22} color="#FFFFFF" />
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
              <Feather name="menu" size={22} color="#FFFFFF" />
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
                <Text style={styles.brandTitle} numberOfLines={1}>
                  {title || "Flexa Market"}
                </Text>
              </View>
            </View>
          ) : title ? (
            <Text style={styles.pageTitle} numberOfLines={1}>
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
              <Feather name="user" size={20} color="#FFFFFF" />
            </Pressable>
          ) : null}
          {showBell ? (
            <Pressable
              onPress={() => router.push(token ? "/notifications" : "/auth/login")}
              style={styles.iconBtn}
              accessibilityLabel="Notifications"
              testID="nav-bell"
            >
              <Feather name="bell" size={20} color="#FFFFFF" />
            </Pressable>
          ) : null}
          {showCart ? (
            <Pressable
              onPress={() => router.push("/cart")}
              style={styles.iconBtn}
              accessibilityLabel="Cart"
              testID="nav-cart"
            >
              <Feather name="shopping-cart" size={20} color="#FFFFFF" />
              {count > 0 ? (
                <View style={styles.badge}>
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
    backgroundColor: colors.flexaOrange,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
});
