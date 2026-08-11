import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

// NOTE: setNotificationHandler and channel creation are intentionally
// inside the hook (not at module level) to avoid calling iOS notification
// APIs before native modules finish initializing — which caused a startup crash.

async function setupNotifications() {
  // Set how notifications are handled when app is foregrounded
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  // Create Android channels (no-op on iOS)
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Flexa Market",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#F97316",
      sound: "default",
    }).catch(() => {});

    await Notifications.setNotificationChannelAsync("orders", {
      name: "New Orders",
      description: "Urgent alerts when you receive a new order",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 500, 500, 500, 500],
      lightColor: "#F97316",
      sound: "default",
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
    }).catch(() => {});
  }
}

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  try {
    await setupNotifications();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") return null;

    const tokenResult = await Promise.race<Notifications.ExpoPushToken | null>([
      Notifications.getExpoPushTokenAsync({
        projectId: "45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e",
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
    ]);

    return tokenResult?.data ?? null;
  } catch {
    return null;
  }
}

export function usePushNotifications(
  injectJs?: (script: string) => void,
) {
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    registerForPushNotifications().then((token) => {
      if (!token) return;
      tokenRef.current = token;
      if (injectJs) {
        const platform = Platform.OS;
        injectJs(
          `(function(){window.__expoPushToken=${JSON.stringify(token)};window.__expoPushPlatform=${JSON.stringify(platform)};` +
          `if(typeof window.__onExpoPushToken==='function')window.__onExpoPushToken(${JSON.stringify(token)},${JSON.stringify(platform)});` +
          `})();true;`
        );
      }
    }).catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const url = response.notification.request.content.data?.url as string | undefined;
        if (url && injectJs) {
          injectJs(
            `(function(){if(window.__handlePushUrl)window.__handlePushUrl(${JSON.stringify(url)});})();true;`
          );
        }
      }
    );

    return () => sub.remove();
  }, []);

  return tokenRef;
}
