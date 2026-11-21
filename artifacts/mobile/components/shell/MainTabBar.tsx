/**
 * Native bottom tabs for stack screens that sit outside `(tabs)` but still
 * need the shared Home / Categories / Messages / Cart / My Account chrome.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import colors from "@/constants/colors";
import { useCart } from "@/context/CartContext";
import {
  TAB_BAR_CONTENT_HEIGHT,
  TAB_BAR_TOP_PAD,
  useBottomSafeInset,
} from "@/hooks/useTabContentInsets";

export type MainTabKey = "home" | "categories" | "messages" | "cart" | "account";

type Props = {
  active: MainTabKey;
};

const TABS: {
  key: MainTabKey;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  href: string;
}[] = [
  { key: "home", label: "Home", icon: "home", href: "/(tabs)" },
  { key: "categories", label: "Categories", icon: "grid", href: "/(tabs)/search" },
  { key: "messages", label: "Messages", icon: "message-circle", href: "/(tabs)/inbox" },
  { key: "cart", label: "Cart", icon: "shopping-cart", href: "/(tabs)/cart" },
  { key: "account", label: "My Account", icon: "user", href: "/(tabs)/profile" },
];

export function MainTabBar({ active }: Props) {
  const router = useRouter();
  const { count: cartCount } = useCart();
  const padBottom = useBottomSafeInset();
  const height = useMemo(
    () => TAB_BAR_CONTENT_HEIGHT + TAB_BAR_TOP_PAD + padBottom,
    [padBottom],
  );

  return (
    <View
      style={[styles.bar, { height, paddingBottom: padBottom, paddingTop: TAB_BAR_TOP_PAD }]}
      testID="main-tab-bar"
    >
      {TABS.map((tab) => {
        const on = tab.key === active;
        const color = on ? colors.flexaGreen : "#94A3B8";
        return (
          <Pressable
            key={tab.key}
            style={styles.item}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
            onPress={() => {
              if (tab.key === active && tab.key === "account") return;
              router.replace(tab.href as any);
            }}
          >
            <View>
              <Feather name={tab.icon} size={22} color={color} />
              {tab.key === "cart" && cartCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {cartCount > 99 ? "99+" : String(cartCount)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFFFF",
    borderTopColor: "#E2E8F0",
    borderTopWidth: 1,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.flexaOrange,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
});
