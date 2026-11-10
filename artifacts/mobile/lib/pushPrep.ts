/**
 * Firebase / Expo push preparation for native Expo Router.
 *
 * Approach: expo-notifications → Expo push token → POST/DELETE /api/push/expo-token.
 * google-services.json remains for Android package com.flexa.market.
 * Does NOT invent credentials or claim physical-device delivery success.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AppState, Platform } from "react-native";
import { getApiBase } from "./api";
import { ALL_PUSH_CHANNEL_IDS, PUSH_CHANNELS } from "./pushChannels";
import {
  getOrCreatePushDeviceId,
  getStoredExpoPushToken,
  storeExpoPushToken,
} from "./pushDevice";

const EAS_PROJECT_ID = "45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e";
const RETRY_DELAYS_MS = [800, 2000, 5000];

export type PushPrepStatus = {
  googleServicesFileConfigured: boolean;
  expoNotificationsInstalled: boolean;
  easProjectId: string;
  androidPackage: string;
  registrationAttempted: boolean;
  tokenRegistered: boolean;
  permissionStatus?: string;
  lastError?: string;
  deviceIdPresent: boolean;
};

let lastStatus: PushPrepStatus = {
  googleServicesFileConfigured: true,
  expoNotificationsInstalled: true,
  easProjectId: EAS_PROJECT_ID,
  androidPackage: "com.flexa.market",
  registrationAttempted: false,
  tokenRegistered: false,
  deviceIdPresent: false,
};

let handlerConfigured = false;
let tokenListenerAttached = false;
let activeJwt: string | null = null;
let registerInFlight: Promise<string | null> | null = null;

export function getPushPrepStatus(): PushPrepStatus {
  return { ...lastStatus };
}

export function getConfiguredEasProjectId(): string {
  return EAS_PROJECT_ID;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function withRetries<T>(
  label: string,
  fn: () => Promise<T>,
  isRetryable: (err: unknown) => boolean,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i >= RETRY_DELAYS_MS.length || !isRetryable(err)) break;
      await sleep(RETRY_DELAYS_MS[i]);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} failed`);
}

function isNetworkish(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /network|timeout|offline|failed to fetch|Network request failed/i.test(msg);
}

async function ensureAndroidChannels() {
  if (Platform.OS !== "android") return;
  const specs: Record<string, { name: string; importance: Notifications.AndroidImportance }> = {
    [PUSH_CHANNELS.MESSAGES]: {
      name: "Messages",
      importance: Notifications.AndroidImportance.MAX,
    },
    [PUSH_CHANNELS.ORDERS]: {
      name: "Orders",
      importance: Notifications.AndroidImportance.MAX,
    },
    [PUSH_CHANNELS.DEFAULT]: {
      name: "Flexa Market",
      importance: Notifications.AndroidImportance.HIGH,
    },
    [PUSH_CHANNELS.ADMIN]: {
      name: "Announcements",
      importance: Notifications.AndroidImportance.HIGH,
    },
    [PUSH_CHANNELS.TV]: {
      name: "Flexa TV",
      importance: Notifications.AndroidImportance.DEFAULT,
    },
    [PUSH_CHANNELS.SYSTEM]: {
      name: "System",
      importance: Notifications.AndroidImportance.DEFAULT,
    },
  };
  for (const id of ALL_PUSH_CHANNEL_IDS) {
    const spec = specs[id];
    await Notifications.setNotificationChannelAsync(id, {
      name: spec.name,
      importance: spec.importance,
      vibrationPattern: [0, 400, 200, 400],
      lightColor: "#F97316",
      sound: "default",
      showBadge: true,
    }).catch(() => {});
  }
}

function ensureHandler() {
  if (handlerConfigured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
  handlerConfigured = true;
}

async function postToken(
  jwt: string,
  token: string,
  deviceId: string,
): Promise<void> {
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
      deviceId,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Token save failed (${res.status})${body ? `: ${body.slice(0, 80)}` : ""}`);
  }
}

async function deleteTokenOnServer(
  jwt: string,
  token: string | null,
  deviceId?: string | null,
): Promise<void> {
  const body: Record<string, string> = {};
  if (token) body.token = token;
  if (deviceId) body.deviceId = deviceId;
  if (!body.token && !body.deviceId) return;

  const res = await fetch(`${getApiBase()}/push/expo-token`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  // 401/403: session already invalid — treat as cleaned up locally.
  if (res.status === 401 || res.status === 403) return;
  if (!res.ok && res.status !== 404) {
    throw new Error(`Token unregister failed (${res.status})`);
  }
}

/**
 * Register Expo push token for the signed-in user (with retries).
 */
export async function registerExpoPushToken(
  jwt: string,
): Promise<string | null> {
  activeJwt = jwt;
  if (registerInFlight) return registerInFlight;

  registerInFlight = (async () => {
    lastStatus.registrationAttempted = true;
    lastStatus.lastError = undefined;

    if (!Device.isDevice) {
      lastStatus.lastError = "Physical device required for push tokens";
      return null;
    }

    try {
      ensureHandler();
      await ensureAndroidChannels();
      const deviceId = await getOrCreatePushDeviceId();
      lastStatus.deviceIdPresent = true;

      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      lastStatus.permissionStatus = finalStatus;
      if (finalStatus !== "granted") {
        lastStatus.lastError = "Notification permission not granted";
        lastStatus.tokenRegistered = false;
        return null;
      }

      const tokenResult = await Promise.race<Notifications.ExpoPushToken | null>([
        Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000)),
      ]);
      const token = tokenResult?.data ?? null;
      if (!token || !token.startsWith("Expo")) {
        lastStatus.lastError = "Expo push token unavailable (timeout or FCM not ready)";
        lastStatus.tokenRegistered = false;
        return null;
      }

      await withRetries(
        "register",
        () => postToken(jwt, token, deviceId),
        isNetworkish,
      );
      await storeExpoPushToken(token);
      lastStatus.tokenRegistered = true;
      attachTokenRefreshListener();
      return token;
    } catch (e) {
      lastStatus.lastError =
        e instanceof Error ? e.message : "Push registration failed";
      lastStatus.tokenRegistered = false;
      return null;
    } finally {
      registerInFlight = null;
    }
  })();

  return registerInFlight;
}

/**
 * Unregister this device's Expo token (logout / account switch).
 * Uses the still-valid JWT; ownership is enforced server-side.
 */
export async function unregisterExpoPushToken(
  jwt: string | null | undefined,
): Promise<void> {
  if (!jwt) return;
  const token = await getStoredExpoPushToken();
  const deviceId = await getOrCreatePushDeviceId().catch(() => null);
  try {
    await withRetries(
      "unregister",
      () => deleteTokenOnServer(jwt, token, deviceId),
      isNetworkish,
    );
  } catch (e) {
    lastStatus.lastError =
      e instanceof Error ? e.message : "Push unregister failed";
    // Keep local token so a later signed-in session can overwrite;
    // do not block logout.
  } finally {
    await storeExpoPushToken(null);
    lastStatus.tokenRegistered = false;
    if (activeJwt === jwt) activeJwt = null;
  }
}

function attachTokenRefreshListener() {
  if (tokenListenerAttached) return;
  tokenListenerAttached = true;
  Notifications.addPushTokenListener(() => {
    const jwt = activeJwt;
    if (!jwt) return;
    // Expo token rotated (reinstall / FCM refresh) — re-register with same JWT.
    void registerExpoPushToken(jwt);
  });

  AppState.addEventListener("change", (state) => {
    if (state !== "active" || !activeJwt) return;
    // Soft retry after returning from settings if permission was previously denied.
    if (lastStatus.permissionStatus && lastStatus.permissionStatus !== "granted") {
      void registerExpoPushToken(activeJwt);
    } else if (!lastStatus.tokenRegistered && lastStatus.lastError && isNetworkish(lastStatus.lastError)) {
      void registerExpoPushToken(activeJwt);
    }
  });
}

/** Test helper — not used in production UI. */
export async function __resetPushPrepForTests() {
  lastStatus = {
    googleServicesFileConfigured: true,
    expoNotificationsInstalled: true,
    easProjectId: EAS_PROJECT_ID,
    androidPackage: "com.flexa.market",
    registrationAttempted: false,
    tokenRegistered: false,
    deviceIdPresent: false,
  };
  handlerConfigured = false;
  activeJwt = null;
  registerInFlight = null;
  await AsyncStorage.multiRemove([
    "flexa_push_last_expo_token_v1",
  ]).catch(() => {});
}
