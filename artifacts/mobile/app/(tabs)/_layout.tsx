import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { fetchUnreadCount } from "@/lib/chatApi";

/** Icon + label row above the system inset (applied once on the shared tab bar). */
const TAB_BAR_CONTENT_HEIGHT = 52;
const TAB_BAR_TOP_PAD = 6;

/** Marketplace routes that keep the shared bottom bar (no tab icon). */
const HIDDEN_TAB_ROUTES = [
  "cart",
  "favorites",
  "orders",
  "my-listings",
  "sales",
  "offers",
  "wallet",
  "addresses",
  "notifications",
  "settings",
  "support",
  "esim",
] as const;

export default function TabLayout() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [unread, setUnread] = useState(0);

  const tabBarPaddingBottom = Math.max(insets.bottom, 8);
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
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#F97316",
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
        // Safe area is applied once via tabBarStyle.paddingBottom — don't double-count.
        safeAreaInsets: { bottom: 0 },
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
          title: "Search",
          tabBarIcon: ({ color, size }) => (
            <Feather name="search" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: "Sell",
          tabBarIcon: ({ color, size }) => (
            <Feather name="plus-circle" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Chat",
          tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: "#F97316",
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
        name="profile"
        options={{
          title: "Account",
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" color={color} size={size} />
          ),
        }}
      />
      {HIDDEN_TAB_ROUTES.map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            href: null,
            title: name,
          }}
        />
      ))}
    </Tabs>
  );
}
