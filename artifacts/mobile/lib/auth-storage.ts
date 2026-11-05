/**
 * Client-side JWT persistence for the native Expo app.
 *
 * Prefers expo-secure-store (encrypted keychain / Keystore).
 * Falls back to AsyncStorage when SecureStore is unavailable (e.g. some web/dev hosts).
 *
 * Does not change backend authentication — only where the existing JWT is stored on device.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/config";

let secureStoreUsable: boolean | null = null;

async function canUseSecureStore(): Promise<boolean> {
  if (secureStoreUsable !== null) return secureStoreUsable;
  if (Platform.OS === "web") {
    secureStoreUsable = false;
    return false;
  }
  try {
    secureStoreUsable = await SecureStore.isAvailableAsync();
  } catch {
    secureStoreUsable = false;
  }
  return secureStoreUsable;
}

export async function readAuthToken(): Promise<string | null> {
  try {
    if (await canUseSecureStore()) {
      const secure = await SecureStore.getItemAsync(AUTH_TOKEN_STORAGE_KEY);
      if (secure) return secure;
      // One-time migrate from legacy AsyncStorage if present.
      const legacy = await AsyncStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (legacy) {
        await SecureStore.setItemAsync(AUTH_TOKEN_STORAGE_KEY, legacy);
        await AsyncStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        return legacy;
      }
      return null;
    }
    return await AsyncStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    try {
      return await AsyncStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }
}

export async function writeAuthToken(token: string): Promise<void> {
  if (await canUseSecureStore()) {
    await SecureStore.setItemAsync(AUTH_TOKEN_STORAGE_KEY, token);
    await AsyncStorage.removeItem(AUTH_TOKEN_STORAGE_KEY).catch(() => {});
    return;
  }
  await AsyncStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  const tasks: Promise<unknown>[] = [
    AsyncStorage.removeItem(AUTH_TOKEN_STORAGE_KEY).catch(() => {}),
  ];
  if (await canUseSecureStore()) {
    tasks.push(SecureStore.deleteItemAsync(AUTH_TOKEN_STORAGE_KEY).catch(() => {}));
  }
  await Promise.all(tasks);
}
