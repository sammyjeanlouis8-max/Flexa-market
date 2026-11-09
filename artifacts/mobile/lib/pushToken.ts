import { apiFetch } from "@/lib/api";
import { Platform } from "react-native";

/** Register Expo push token with existing backend (FCM via Expo). */
export async function registerExpoPushToken(
  token: string,
  authJwt: string,
  deviceId: string | null = null,
): Promise<boolean> {
  if (!token.startsWith("ExponentPushToken") && !token.startsWith("Expo")) {
    // Backend requires Expo-format tokens.
    return false;
  }
  const res = await apiFetch("/push/expo-token", {
    method: "POST",
    token: authJwt,
    body: JSON.stringify({
      token,
      platform: Platform.OS,
      deviceId,
    }),
  });
  return res.ok;
}

export async function unregisterExpoPushToken(
  token: string,
  authJwt: string,
): Promise<boolean> {
  const res = await apiFetch("/push/expo-token", {
    method: "DELETE",
    token: authJwt,
    body: JSON.stringify({ token }),
  });
  return res.ok;
}
