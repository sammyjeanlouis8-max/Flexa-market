import { Stack } from "expo-router";
import React from "react";
import { AdminControlProvider } from "@/context/AdminControlContext";

/**
 * Flexa Control stack — staff gate + country/period context for all /admin routes.
 */
export default function AdminLayout() {
  return (
    <AdminControlProvider>
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="orders" />
        <Stack.Screen name="payments" />
        <Stack.Screen name="analytics" />
        <Stack.Screen name="more" />
        <Stack.Screen name="[module]" />
      </Stack>
    </AdminControlProvider>
  );
}
