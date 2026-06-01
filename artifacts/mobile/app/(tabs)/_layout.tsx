import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, View, useColorScheme } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

export default function TabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const { t } = useLanguage();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "rgba(255,255,255,0.97)",
          borderTopWidth: 1,
          borderTopColor: "rgba(0,0,0,0.08)",
          elevation: 0,
          height: isWeb ? 84 : 60,
        },
        tabBarBackground: () => (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(255,255,255,0.97)",
            }}
          />
        ),
        tabBarActiveTintColor: "#F97316",
        tabBarInactiveTintColor: "#64748B",
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabHome"),
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t("tabSearch"),
          tabBarIcon: ({ color }) => <Feather name="search" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: t("tabSell"),
          tabBarActiveTintColor: colors.accent,
          tabBarIcon: ({ color }) => <Feather name="plus-circle" size={26} color={colors.accent} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: t("tabMessages"),
          tabBarIcon: ({ color }) => <Feather name="message-circle" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabProfile"),
          tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
