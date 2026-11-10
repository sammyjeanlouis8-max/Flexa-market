/**
 * Admin Control Center stack — native Expo Router only.
 */
import { Stack } from "expo-router";

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="users" />
      <Stack.Screen name="users/[id]" />
      <Stack.Screen name="moderation" />
      <Stack.Screen name="reports" />
      <Stack.Screen name="orders" />
      <Stack.Screen name="deliveries" />
      <Stack.Screen name="boosts" />
      <Stack.Screen name="videos" />
      <Stack.Screen name="finance" />
      <Stack.Screen name="audit" />
      <Stack.Screen name="traffic" />
      <Stack.Screen name="team" />
      <Stack.Screen name="kyc" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
