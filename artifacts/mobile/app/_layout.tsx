/**
 * Root layout — native Expo Router entry (Phase 0).
 *
 * Providers: React Query + Auth + API client bootstrap.
 * Navigation: native tab shell + stack routes for screens still migrating.
 */
import "react-native-gesture-handler";

import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppProviders } from "@/providers/AppProviders";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProviders>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth/login" options={{ headerShown: false }} />
            <Stack.Screen
              name="auth/register"
              options={{ headerShown: false }}
            />
            <Stack.Screen name="cart" options={{ headerShown: false }} />
            <Stack.Screen name="wallet" options={{ headerShown: false }} />
            <Stack.Screen name="flex-card" options={{ headerShown: false }} />
            <Stack.Screen name="music" options={{ headerShown: false }} />
            <Stack.Screen name="tv" options={{ headerShown: false }} />
            <Stack.Screen name="orders" options={{ headerShown: false }} />
            <Stack.Screen name="orders/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="listing/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="favorites" options={{ headerShown: false }} />
            <Stack.Screen name="offers" options={{ headerShown: false }} />
            <Stack.Screen name="notifications" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
            <Stack.Screen name="sales" options={{ headerShown: false }} />
            <Stack.Screen name="my-listings" options={{ headerShown: false }} />
            <Stack.Screen name="my-boosts" options={{ headerShown: false }} />
            <Stack.Screen name="videos" options={{ headerShown: false }} />
            <Stack.Screen name="boost" options={{ headerShown: false }} />
            <Stack.Screen name="subscription" options={{ headerShown: false }} />
            <Stack.Screen
              name="stripe-checkout"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="delivery-tracking"
              options={{ headerShown: false }}
            />
            <Stack.Screen name="driver-apply" options={{ headerShown: false }} />
            <Stack.Screen
              name="driver-dashboard"
              options={{ headerShown: false }}
            />
            <Stack.Screen name="kyc" options={{ headerShown: false }} />
            <Stack.Screen name="admin" options={{ headerShown: false }} />
            <Stack.Screen name="loans" options={{ headerShown: false }} />
            <Stack.Screen
              name="language-picker"
              options={{ headerShown: false }}
            />
            <Stack.Screen name="website" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" options={{ headerShown: false }} />
          </Stack>
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
