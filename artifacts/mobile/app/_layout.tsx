import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

SplashScreen.preventAutoHideAsync();

const NO_HEADER = { headerShown: false } as const;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
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
          <Stack.Screen name="+not-found" options={NO_HEADER} />
        </Stack>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
