/**
 * Root layout — native Expo Router tree.
 * Auth + marketplace screens; no WebView shell entry.
 */
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PushBootstrap } from "@/components/PushBootstrap";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { MarketplaceProvider } from "@/context/MarketplaceContext";

SplashScreen.preventAutoHideAsync().catch(() => {});

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
                  <Stack.Screen name="listing/[id]" />
                  <Stack.Screen name="cart" />
                  <Stack.Screen name="checkout" />
                  <Stack.Screen name="checkout-success" />
                  <Stack.Screen name="orders" />
                  <Stack.Screen name="orders/[id]" />
                  <Stack.Screen name="favorites" />
                  <Stack.Screen name="wallet" />
                  <Stack.Screen name="chat/[id]" />
                  <Stack.Screen name="my-listings" />
                  <Stack.Screen name="sales" />
                  <Stack.Screen name="offers" />
                  <Stack.Screen name="support" />
                  <Stack.Screen name="support/[id]" />
                  <Stack.Screen name="chatbot" />
                  <Stack.Screen name="addresses" />
                  <Stack.Screen name="edit-profile" />
                  <Stack.Screen name="stripe-checkout" />
                  <Stack.Screen name="language-picker" />
                  <Stack.Screen name="esim" />
                  <Stack.Screen name="notifications" />
                  <Stack.Screen name="settings" />
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
