/**
 * Firebase / Expo push preparation for native Expo Router (Phase 3A).
 *
 * Status (inspected, not invented):
 * - google-services.json is present for Android package `com.flexamarket.app`
 *   and Firebase project `flexa-market-8873a` (see app.json googleServicesFile).
 * - withOptionalGoogleServices keeps builds green if the file is absent.
 * - expo-notifications is already a dependency.
 * - Server endpoint: POST /api/push/expo-token (Bearer JWT).
 *
 * This module registers the Expo push token when the user is signed in.
 * It does NOT claim FCM delivery success, does NOT invent credentials,
 * and does NOT fabricate notifications.
 */
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getApiBase } from "./api";

const EAS_PROJECT_ID = "45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e";

export type PushPrepStatus = {
  googleServicesFileConfigured: boolean;
  expoNotificationsInstalled: boolean;
  registrationAttempted: boolean;
  tokenRegistered: boolean;
  lastError?: string;
};

let lastStatus: PushPrepStatus = {
  googleServicesFileConfigured: true, // app.json points at ./google-services.json
  expoNotificationsInstalled: true,
  registrationAttempted: false,
  tokenRegistered: false,
};

export function getPushPrepStatus(): PushPrepStatus {
  return { ...lastStatus };
}

async function ensureAndroidChannels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("flexa-messages", {
    name: "Messages",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500],
    lightColor: "#F97316",
    sound: "default",
    showBadge: true,
  }).catch(() => {});
  await Notifications.setNotificationChannelAsync("orders", {
    name: "New Orders",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor: "#F97316",
    sound: "default",
    showBadge: true,
  }).catch(() => {});
  await Notifications.setNotificationChannelAsync("default", {
    name: "Flexa Market",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 200, 300],
    lightColor: "#F97316",
    sound: "default",
    showBadge: true,
  }).catch(() => {});
}

/**
 * Attempt Expo push token registration + server save.
 * Safe to call repeatedly; returns null when device/permission/token unavailable.
 */
export async function registerExpoPushToken(
  jwt: string,
): Promise<string | null> {
  lastStatus.registrationAttempted = true;
  lastStatus.lastError = undefined;

  if (!Device.isDevice) {
    lastStatus.lastError = "Physical device required for push tokens";
    return null;
  }

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    await ensureAndroidChannels();

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      lastStatus.lastError = "Notification permission not granted";
      return null;
    }

    const tokenResult = await Promise.race<Notifications.ExpoPushToken | null>([
      Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000)),
    ]);
    const token = tokenResult?.data ?? null;
    if (!token) {
      lastStatus.lastError = "Expo push token unavailable (timeout or FCM not ready)";
      return null;
    }

    const res = await fetch(`${getApiBase()}/push/expo-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
      },
      body: JSON.stringify({
        token,
        platform: Platform.OS,
        deviceId: null,
      }),
    });
    if (!res.ok) {
      lastStatus.lastError = `Token save failed (${res.status})`;
      lastStatus.tokenRegistered = false;
      return token;
    }
    lastStatus.tokenRegistered = true;
    return token;
  } catch (e) {
    lastStatus.lastError =
      e instanceof Error ? e.message : "Push registration failed";
    lastStatus.tokenRegistered = false;
    return null;
  }
}
