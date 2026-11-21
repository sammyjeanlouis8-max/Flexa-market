import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import {
  TAB_BAR_CONTENT_HEIGHT,
  TAB_BAR_TOP_PAD,
  useBottomSafeInset,
} from "@/hooks/useTabContentInsets";
import { fetchUnreadCount } from "@/lib/chatApi";

export default function TabLayout() {
  const { token } = useAuth();
  const { count: cartCount } = useCart();
  const [unread, setUnread] = useState(0);

  const tabBarPaddingBottom = useBottomSafeInset();
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + TAB_BAR_TOP_PAD + tabBarPaddingBottom;

  const tabBarStyle = useMemo(
    () => ({
      backgroundColor: "#FFFFFF",
      borderTopColor: "#E2E8F0",
      borderTopWidth: 1,
      height: tabBarHeight,
      paddingTop: TAB_BAR_TOP_PAD,
      paddingBottom: tabBarPaddingBottom,
    }),
    [tabBarHeight, tabBarPaddingBottom],
  );

  useEffect(() => {
    if (!token) {
      setUnread(0);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const n = await fetchUnreadCount({ token });
        if (!cancelled) setUnread(n);
      } catch {
        /* keep previous badge */
      }
    };
    void tick();
    const id = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  return (
    <Tabs
      // Safe area is applied once via tabBarStyle.paddingBottom — don't double-count.
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.flexaGreen,
        tabBarInactiveTintColor: "#94A3B8",
        tabBarStyle,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          marginBottom: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Categories",
          tabBarIcon: ({ color, size }) => (
            <Feather name="grid" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Messages",
          tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.flexaOrange,
            color: "#FFFFFF",
            fontSize: 10,
            fontWeight: "800",
          },
          tabBarIcon: ({ color, size }) => (
            <View>
              <Feather name="message-circle" color={color} size={size} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Cart",
          tabBarBadge: cartCount > 0 ? (cartCount > 99 ? "99+" : cartCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.flexaOrange,
            color: "#FFFFFF",
            fontSize: 10,
            fontWeight: "800",
          },
          tabBarIcon: ({ color, size }) => (
            <Feather name="shopping-cart" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "My Account",
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" color={color} size={size} />
          ),
        }}
      />
      {/* Keep Music / Sell routes reachable (drawer, deep links) without a tab icon. */}
      <Tabs.Screen
        name="music"
        options={{
          href: null,
          title: "Music",
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          href: null,
          title: "Sell",
        }}
      />
    </Tabs>
  );
}
