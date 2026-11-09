import { useAuth } from "@/context/AuthContext";
import { routeFromPushData } from "@/lib/notificationRouting";
import { planLogoutTokenCleanup, planTokenRegistration } from "@/lib/pushLifecycle";
import { registerExpoPushToken, unregisterExpoPushToken } from "@/lib/pushToken";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";

const EXPO_PROJECT_ID = "45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e";

/**
 * Android notification channels aligned with backend `channelId` values
 * (orders, default, admin-broadcast, flexa-tv) plus native coverage channels.
 */
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

  const defs: Array<{
    id: string;
    name: string;
    description?: string;
    importance: Notifications.AndroidImportance;
    bypassDnd?: boolean;
  }> = [
    {
      id: "flexa-messages",
      name: "Messages",
      description: "Chat and support messages",
      importance: Notifications.AndroidImportance.MAX,
    },
    {
      id: "orders",
      name: "Orders",
      description: "Orders, payments, delivery, and seller sales",
      importance: Notifications.AndroidImportance.MAX,
      bypassDnd: true,
    },
    {
      id: "default",
      name: "Flexa Market",
      description: "General Flexa Market alerts",
      importance: Notifications.AndroidImportance.HIGH,
    },
    {
      id: "promotions",
      name: "Promotions",
      description: "Boosts, promotional videos, marketing",
      importance: Notifications.AndroidImportance.DEFAULT,
    },
    {
      id: "admin-broadcast",
      name: "Announcements",
      description: "System announcements and admin communications",
      importance: Notifications.AndroidImportance.HIGH,
    },
    {
      id: "flexa-tv",
      name: "Flexa TV",
      description: "Live TV and broadcast alerts",
      importance: Notifications.AndroidImportance.DEFAULT,
    },
    {
      id: "wallet",
      name: "Wallet",
      description: "Wallet and payout updates",
      importance: Notifications.AndroidImportance.HIGH,
    },
    {
      id: "security",
      name: "Security",
      description: "Account security alerts",
      importance: Notifications.AndroidImportance.MAX,
    },
    {
      id: "music",
      name: "Flexa Music",
      description: "Flexa Music updates",
      importance: Notifications.AndroidImportance.DEFAULT,
    },
  ];

  for (const ch of defs) {
    await Notifications.setNotificationChannelAsync(ch.id, {
      name: ch.name,
      description: ch.description,
      importance: ch.importance,
      vibrationPattern: [0, 400, 200, 400],
      lightColor: "#F97316",
      sound: "default",
      showBadge: true,
      bypassDnd: ch.bypassDnd,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }).catch(() => {});
  }
}

async function getExpoToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn("[push] Physical device or FCM-capable emulator required");
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
    // Expected until Firebase Android app com.flexamarket.app + matching google-services.json.
    console.warn(
      "[push] getExpoPushTokenAsync failed — register com.flexamarket.app in Firebase and wire googleServicesFile",
      e,
    );
    return null;
  }
}

function navigateFromNotificationData(data: Record<string, unknown> | undefined) {
  const route = routeFromPushData(data);
  if (!route) {
    router.push("/notifications");
    return;
  }
  if (route.params) router.push({ pathname: route.pathname as any, params: route.params });
  else router.push(route.pathname as any);
}

/**
 * Native push bootstrap: Android 13+ permission, channels, token lifecycle,
 * foreground/background/killed tap routing. Requires Firebase Android app for
 * com.flexamarket.app before tokens succeed on device.
 */
export function useNativePush() {
  const { token: jwt } = useAuth();
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
        const plan = planTokenRegistration({
          expoToken,
          authJwt: auth,
          permissionGranted: true,
          // Native token mint already succeeded ⇒ FCM config present for this binary.
          firebaseConfiguredForPackage: true,
        });
        if (plan.shouldRegister && auth) {
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

    // Cold start / killed-state: open the screen for the notification that launched the app.
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response || cancelled) return;
        const data = response.notification.request.content.data as
          | Record<string, unknown>
          | undefined;
        navigateFromNotificationData(data);
      })
      .catch(() => {});

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncToken();
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      navigateFromNotificationData(data);
    });

    const receiveSub = Notifications.addNotificationReceivedListener(() => {
      // Foreground: system handler shows banner; inbox/notification screens poll independently.
    });

    // Token refresh (FCM rotates device token → Expo token updates).
    const tokenSub = Notifications.addPushTokenListener(() => {
      void syncToken();
    });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      appStateSub.remove();
      responseSub.remove();
      receiveSub.remove();
      tokenSub.remove();
    };
  }, []);

  // Re-register when JWT appears (login).
  useEffect(() => {
    const expoToken = pushTokenRef.current;
    if (jwt && expoToken) {
      void registerExpoPushToken(expoToken, jwt);
    }
  }, [jwt]);

  return {
    getPushToken: () => pushTokenRef.current,
    unregisterOnLogout: async () => {
      const plan = planLogoutTokenCleanup({
        previousJwt: jwtRef.current,
        nextJwt: null,
        expoToken: pushTokenRef.current,
      });
      if (plan.shouldUnregister && plan.expoToken && plan.authJwtToUse) {
        await unregisterExpoPushToken(plan.expoToken, plan.authJwtToUse).catch(() => false);
      }
    },
  };
}
