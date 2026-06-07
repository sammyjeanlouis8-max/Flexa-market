import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initPushNotifications } from "../lib/pushTokens";

// Prevent the splash from disappearing before the first frame can render.
// Wrapped in try/catch because on some Android startups the splash module
// can throw during cold-start race conditions, which would otherwise crash
// the whole RN bridge before any user-visible UI.
try {
  SplashScreen.preventAutoHideAsync();
} catch {
  // best-effort
}

const NO_HEADER = { headerShown: false } as const;

// Fail-safe timeout: if @expo-google-fonts has not resolved within this
// window we render with the system font instead of hanging on the splash
// indefinitely. This protects against a class of Android startup hangs
// where the font module fails silently on certain OEM builds (a common
// "Android startup crash" symptom in Expo apps that resolves to a
// permanently black splash screen rather than a true native crash).
const FONT_TIMEOUT_MS = 4000;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [fontTimeoutFired, setFontTimeoutFired] = React.useState(false);

  // Force render after the timeout even if fonts have not loaded.
  useEffect(() => {
    if (fontsLoaded || fontError) return undefined;
    const t = setTimeout(() => setFontTimeoutFired(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [fontsLoaded, fontError]);

  const ready = fontsLoaded || !!fontError || fontTimeoutFired;

  useEffect(() => {
    if (!ready) return;
    // hideAsync rejects if the splash was already auto-dismissed by the OS;
    // swallowing the rejection keeps the JS context alive on Android.
    SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Initialise the push pipeline once the JS context is healthy. Inside
  // initPushNotifications() the permission prompt is deferred via a setTimeout
  // microtask, so this never blocks first paint and never throws.
  useEffect(() => {
    if (!ready) return;
    try {
      initPushNotifications();
    } catch {
      // Defensive: an exception escaping initPushNotifications must never
      // bring down the layout. Push will simply not work for this session.
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/*
         * StatusBar:
         *   - style="light" → white icons over the dark #0F172A background
         *     used across all screens (matches the splash and shell color).
         *   - translucent on Android lets the WebView paint behind the
         *     status bar but our SafeAreaView/wrapped screens still respect
         *     insets via useSafeAreaInsets().
         *   - On iOS the status bar text color is required to be set
         *     explicitly per App Store visual review.
         */}
        <StatusBar style="light" backgroundColor="#0F172A" translucent />
        <Stack screenOptions={NO_HEADER}>
          <Stack.Screen name="(tabs)" options={NO_HEADER} />
          <Stack.Screen name="website" options={NO_HEADER} />
          <Stack.Screen name="settings" options={NO_HEADER} />
          <Stack.Screen name="notifications" options={NO_HEADER} />
          <Stack.Screen name="orders" options={NO_HEADER} />
          <Stack.Screen name="orders/[id]" options={NO_HEADER} />
          <Stack.Screen name="wallet" options={NO_HEADER} />
          <Stack.Screen name="subscription" options={NO_HEADER} />
          <Stack.Screen name="boost" options={NO_HEADER} />
          <Stack.Screen name="my-listings" options={NO_HEADER} />
          <Stack.Screen name="my-boosts" options={NO_HEADER} />
          <Stack.Screen name="favorites" options={NO_HEADER} />
          <Stack.Screen name="offers" options={NO_HEADER} />
          <Stack.Screen name="sales" options={NO_HEADER} />
          <Stack.Screen name="cart" options={NO_HEADER} />
          <Stack.Screen name="chat/[id]" options={NO_HEADER} />
          <Stack.Screen name="listing/[id]" options={NO_HEADER} />
          <Stack.Screen name="edit-profile" options={NO_HEADER} />
          <Stack.Screen name="kyc" options={NO_HEADER} />
          <Stack.Screen name="loans" options={NO_HEADER} />
          <Stack.Screen name="videos" options={NO_HEADER} />
          <Stack.Screen name="language-picker" options={NO_HEADER} />
          <Stack.Screen name="driver-apply" options={NO_HEADER} />
          <Stack.Screen name="driver-dashboard" options={NO_HEADER} />
          <Stack.Screen name="delivery-tracking" options={NO_HEADER} />
          <Stack.Screen name="inbox" options={NO_HEADER} />
          <Stack.Screen name="admin" options={NO_HEADER} />
          <Stack.Screen name="auth/login" options={NO_HEADER} />
          <Stack.Screen name="auth/register" options={NO_HEADER} />
          <Stack.Screen name="stripe-checkout" options={NO_HEADER} />
          <Stack.Screen name="+not-found" options={NO_HEADER} />
        </Stack>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
