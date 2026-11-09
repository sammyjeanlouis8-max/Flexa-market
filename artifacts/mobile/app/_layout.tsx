/**
 * Root layout — native Expo Router shell (Phase 2 Milestone 2).
 * Auth + marketplace country + language. No WebView at the root.
 */
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { MarketplaceProvider } from "@/context/MarketplaceContext";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <LanguageProvider>
            <AuthProvider>
              <MarketplaceProvider>
                <StatusBar barStyle="light-content" backgroundColor="#0B1220" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: "#0B1220" },
                    animation: "slide_from_right",
                  }}
                >
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="auth/login" options={{ presentation: "modal" }} />
                  <Stack.Screen name="auth/register" options={{ presentation: "modal" }} />
                  <Stack.Screen name="listing/[id]" />
                  <Stack.Screen name="categories/index" />
                  <Stack.Screen name="categories/[slug]" />
                  <Stack.Screen name="country-picker" options={{ presentation: "modal" }} />
                  <Stack.Screen name="language-picker" options={{ presentation: "modal" }} />
                  <Stack.Screen name="+not-found" />
                </Stack>
              </MarketplaceProvider>
            </AuthProvider>
          </LanguageProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
