import { Stack } from "expo-router";

/** Nested wholesale stack — all routes stay native (no WebView). */
export default function WholesaleLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
