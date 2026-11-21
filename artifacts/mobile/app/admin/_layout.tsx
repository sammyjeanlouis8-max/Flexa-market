import { Stack } from "expo-router";
import React from "react";

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="users" />
      <Stack.Screen name="moderation" />
      <Stack.Screen name="transactions" />
      <Stack.Screen name="support" />
    </Stack>
  );
}
