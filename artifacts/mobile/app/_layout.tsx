/**
 * Root layout — native Expo Router tree.
 * Auth + marketplace screens; no WebView shell entry.
 */
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PushBootstrap } from "@/components/PushBootstrap";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { MarketplaceProvider } from "@/context/MarketplaceContext";

SplashScreen.preventAutoHideAsync().catch(() => {});
LogBox.ignoreAllLogs(true);

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <LanguageProvider>
            <MarketplaceProvider>
              <CartProvider>
                <PushBootstrap />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="auth/login" />
                  <Stack.Screen name="auth/register" />
                  {/* Dedicated / full-screen flows — no shared bottom tab bar */}
                  <Stack.Screen name="listing/[id]" />
                  <Stack.Screen name="checkout" />
                  <Stack.Screen name="checkout-success" />
                  <Stack.Screen name="orders/[id]" />
                  <Stack.Screen name="chat/[id]" />
                  <Stack.Screen name="support/[id]" />
                  <Stack.Screen name="chatbot" />
                  <Stack.Screen name="edit-profile" />
                  <Stack.Screen name="stripe-checkout" />
                  <Stack.Screen name="language-picker" />
                  <Stack.Screen name="delivery-tracking" />
                  <Stack.Screen name="+not-found" />
                </Stack>
              </CartProvider>
            </MarketplaceProvider>
          </LanguageProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
