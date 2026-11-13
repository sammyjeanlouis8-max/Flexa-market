import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React, { useEffect, useState } from "react";
import { Dimensions, Platform, Text, View } from "react-native";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { fetchUnreadCount } from "@/lib/chatApi";

const NARROW = Dimensions.get("window").width < 360;

function TabLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text
      style={{
        color,
        fontSize: NARROW ? 9 : 10,
        fontWeight: "700",
        textAlign: "center",
        maxWidth: NARROW ? 64 : 72,
      }}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.75}
    >
      {label}
    </Text>
  );
}

export default function TabLayout() {
  const { token } = useAuth();
  const { count: cartCount } = useCart();
  const [unread, setUnread] = useState(0);

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
        tabBarActiveTintColor: colors.flexaGreen,
        tabBarInactiveTintColor: "#94A3B8",
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: "#E2E8F0",
          // Web bottom bar ≈ 57 CSS px (+ iOS home indicator)
          height: Platform.OS === "ios" ? 84 : 56,
          paddingBottom: Platform.OS === "ios" ? 24 : 6,
          paddingTop: 4,
        },
        tabBarIconStyle: { marginTop: 2 },
        tabBarAllowFontScaling: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: ({ color }) => <TabLabel label="Home" color={color} />,
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Categories",
          tabBarLabel: ({ color }) => <TabLabel label="Categories" color={color} />,
          tabBarIcon: ({ color, size }) => (
            <Feather name="grid" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Messages",
          tabBarLabel: ({ color }) => <TabLabel label="Messages" color={color} />,
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
          tabBarLabel: ({ color }) => <TabLabel label="Cart" color={color} />,
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
          tabBarLabel: ({ color }) => <TabLabel label="My Account" color={color} />,
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
