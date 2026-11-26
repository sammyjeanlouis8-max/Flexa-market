import { Stack } from "expo-router";

/** Nested Flexa Restaurant stack — native only (no WebView). */
export default function RestaurantLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
