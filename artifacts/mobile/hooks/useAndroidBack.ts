import { router } from "expo-router";
import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";

/**
 * Android hardware / gesture back.
 * - If a custom handler returns true, navigation is consumed.
 * - Otherwise pop the stack, or fall back to Home on roots.
 */
export function useAndroidBack(onBack?: () => boolean) {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (onBack?.()) return true;
      if (router.canGoBack()) {
        router.back();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [onBack]);
}
