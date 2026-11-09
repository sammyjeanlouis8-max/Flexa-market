/**
 * Root layout for the expo-router tree (native auth + tab screens).
 * Production entry currently uses App.tsx; this layout stays ready for
 * the continuing native migration.
 */
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/context/AuthContext";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="auth/login" options={{ headerShown: false }} />
          <Stack.Screen name="auth/register" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" options={{ headerShown: false }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
