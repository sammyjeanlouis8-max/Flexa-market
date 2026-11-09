import { useAuth } from "@/context/AuthContext";
import { routeFromPushUrl } from "@/lib/notificationRouting";
import { registerExpoPushToken, unregisterExpoPushToken } from "@/lib/pushToken";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";

const EXPO_PROJECT_ID = "45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e";

async function ensureChannels() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("flexa-messages", {
    name: "Messages",
    description: "Chat and support messages",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500],
    lightColor: "#F97316",
    sound: "default",
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  }).catch(() => {});

  await Notifications.setNotificationChannelAsync("orders", {
    name: "Orders",
    description: "Orders, payments, and delivery updates",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor: "#F97316",
    sound: "default",
    bypassDnd: true,
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  }).catch(() => {});

  await Notifications.setNotificationChannelAsync("default", {
    name: "Flexa Market",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 200, 300],
    lightColor: "#F97316",
    sound: "default",
    showBadge: true,
  }).catch(() => {});

  await Notifications.setNotificationChannelAsync("promotions", {
    name: "Promotions",
    description: "Boosts, videos, and promotional updates",
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: "default",
    showBadge: true,
  }).catch(() => {});

  // Matches backend channelId used by admin broadcast pushes.
  await Notifications.setNotificationChannelAsync("admin-broadcast", {
    name: "Announcements",
    description: "System announcements and admin communications",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    showBadge: true,
  }).catch(() => {});
}

async function getExpoToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn("[push] Physical device or configured emulator with FCM required");
    return null;
  }
  await ensureChannels();
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") return null;

  try {
    const result = await Promise.race([
      Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000)),
    ]);
    return result && "data" in result ? result.data : null;
  } catch (e) {
    console.warn("[push] getExpoPushTokenAsync failed — Firebase google-services may be missing for com.flexamarket.app", e);
    return null;
  }
}

function navigateFromNotificationData(data: Record<string, unknown> | undefined) {
  if (!data) {
    router.push("/notifications");
    return;
  }
  const url = typeof data.url === "string" ? data.url : null;
  const conversationId =
    data.conversationId != null
      ? String(data.conversationId)
      : data.params && typeof data.params === "object" && (data.params as any).conversationId != null
        ? String((data.params as any).conversationId)
        : null;

  if (conversationId) {
    router.push({ pathname: "/chat/[id]", params: { id: conversationId } });
    return;
  }

  const route = routeFromPushUrl(url);
  if (!route) {
    router.push("/notifications");
    return;
  }
  if (route.params) router.push({ pathname: route.pathname as any, params: route.params });
  else router.push(route.pathname as any);
}

/**
 * Native push bootstrap: Android 13+ permission, channels, token lifecycle,
 * foreground/background tap routing. Requires Firebase Android app for
 * com.flexamarket.app before tokens succeed on device.
 */
export function useNativePush() {
  const { token: jwt, logout } = useAuth();
  const pushTokenRef = useRef<string | null>(null);
  const jwtRef = useRef<string | null>(jwt);
  jwtRef.current = jwt;

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let registering = false;

    const syncToken = async () => {
      if (cancelled || registering) return;
      registering = true;
      try {
        const expoToken = await getExpoToken();
        if (cancelled || !expoToken) return;
        pushTokenRef.current = expoToken;
        const auth = jwtRef.current;
        if (auth) {
          await registerExpoPushToken(expoToken, auth);
        }
      } finally {
        registering = false;
        if (!cancelled && !pushTokenRef.current) {
          retryTimer = setTimeout(() => void syncToken(), 60_000);
        }
      }
    };

    void syncToken();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncToken();
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      navigateFromNotificationData(data);
    });

    const receiveSub = Notifications.addNotificationReceivedListener(() => {
      // Foreground: system handler already shows banner; inbox screens poll independently.
    });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      appStateSub.remove();
      responseSub.remove();
      receiveSub.remove();
    };
  }, []);

  // Re-register when JWT appears (login) / clear on logout.
  useEffect(() => {
    const expoToken = pushTokenRef.current;
    if (jwt && expoToken) {
      void registerExpoPushToken(expoToken, jwt);
    }
  }, [jwt]);

  return {
    getPushToken: () => pushTokenRef.current,
    unregisterOnLogout: async () => {
      const expoToken = pushTokenRef.current;
      const auth = jwtRef.current;
      if (expoToken && auth) {
        await unregisterExpoPushToken(expoToken, auth).catch(() => false);
      }
      // logout is available if callers need it; token cleanup is primary.
      void logout;
    },
  };
}
