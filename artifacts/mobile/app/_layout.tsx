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
import { BoostAdOverlayHost } from "@/components/BoostAdOverlay";
import { AppDrawer } from "@/components/shell/AppDrawer";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { MarketplaceProvider } from "@/context/MarketplaceContext";
import { NavigationProvider } from "@/context/NavigationContext";
import { ThemeProvider } from "@/context/ThemeContext";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <ThemeProvider>
          <LanguageProvider>
            <MarketplaceProvider>
              <CartProvider>
                <NavigationProvider>
                  <PushBootstrap />
                  <BoostAdOverlayHost />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="auth/login" />
                    <Stack.Screen name="auth/register" />
                    <Stack.Screen name="auth/login-phone" />
                    <Stack.Screen name="auth/forgot-password" />
                    <Stack.Screen
                      name="listing/[id]"
                      options={{ animation: "slide_from_right", gestureEnabled: true }}
                    />
                    <Stack.Screen name="cart" />
                    <Stack.Screen name="checkout" />
                    <Stack.Screen name="checkout-success" />
                    <Stack.Screen name="orders" />
                    <Stack.Screen name="orders/[id]" />
                    <Stack.Screen name="favorites" />
                    <Stack.Screen name="wallet" />
                    <Stack.Screen name="wallet-transfer" />
                    <Stack.Screen name="wallet-history" />
                    <Stack.Screen name="chat/[id]" />
                    <Stack.Screen name="addresses" />
                    <Stack.Screen name="edit-profile" />
                    <Stack.Screen name="stripe-checkout" />
                    <Stack.Screen name="language-picker" />
                    <Stack.Screen name="esim" />
                    <Stack.Screen name="notifications" />
                    <Stack.Screen name="settings" />
                    <Stack.Screen name="settings/security" />
                    <Stack.Screen name="settings/notifications" />
                    <Stack.Screen name="settings/privacy" />
                    <Stack.Screen name="settings/payments" />
                    <Stack.Screen name="settings/help" />
                    <Stack.Screen name="delivery-tracking" />
                    <Stack.Screen name="track" />
                    <Stack.Screen name="track/[trackingNumber]" />
                    <Stack.Screen name="sell" />
                    <Stack.Screen name="sell-edit/[id]" />
                    <Stack.Screen name="my-listings" />
                    <Stack.Screen name="my-drafts" />
                    <Stack.Screen name="my-boosts" />
                    <Stack.Screen name="boost" />
                    <Stack.Screen name="boost-analytics" />
                    <Stack.Screen name="videos" />
                    <Stack.Screen name="videos/watch" options={{ animation: "fade" }} />
                    <Stack.Screen name="my-videos" />
                    <Stack.Screen name="boost-video" />
                    <Stack.Screen name="offers" />
                    <Stack.Screen name="sales" />
                    <Stack.Screen name="kyc" />
                    <Stack.Screen name="subscription" />
                    <Stack.Screen name="admin" />
                    <Stack.Screen name="driver-apply" />
                    <Stack.Screen name="driver-dashboard" />
                    <Stack.Screen name="calculator" />
                    <Stack.Screen name="help-center" />
                    <Stack.Screen name="support" />
                    <Stack.Screen name="support/[id]" />
                    <Stack.Screen name="chatbot" />
                    <Stack.Screen name="legal/[slug]" />
                    <Stack.Screen name="jobs" />
                    <Stack.Screen name="leaderboard" />
                    <Stack.Screen name="commission-promo" />
                    <Stack.Screen name="loans" />
                    <Stack.Screen name="credit-score" />
                    <Stack.Screen name="tv" />
                    <Stack.Screen name="music" />
                    <Stack.Screen name="bnpl" />
                    <Stack.Screen name="flex-card-repay" />
                    <Stack.Screen name="shop/[id]" />
                    <Stack.Screen name="delete-account" />
                    <Stack.Screen name="agents" />
                    <Stack.Screen name="manager" />
                    <Stack.Screen name="analytics" />
                    <Stack.Screen name="website" />
                    <Stack.Screen name="+not-found" />
                  </Stack>
                  <AppDrawer />
                </NavigationProvider>
              </CartProvider>
            </MarketplaceProvider>
          </LanguageProvider>
          </ThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
