import { Tabs } from "expo-router";
import React from "react";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="index" options={{ tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="search" options={{ tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="sell" options={{ tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="inbox" options={{ tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="profile" options={{ tabBarStyle: { display: "none" } }} />
    </Tabs>
  );
}
