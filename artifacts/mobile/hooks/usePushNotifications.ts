import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Create the Android notification channel unconditionally at module load time.
// This must exist before any notification can be delivered on Android 8+.
// We create it here (not inside registerForPushNotifications) so it is always
// present even if the user has not yet granted permission.
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Flexa Market",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#F97316",
    sound: "default",
  }).catch(() => {
    // Non-fatal — channel creation can fail on some emulators
  });
}

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  try {
    // ── 1. Check / request permission ────────────────────────────────────────
    // Note: checkAndRequestPermission() in index.tsx deliberately does NOT call
    // requestPermissionsAsync() to avoid a race condition where two simultaneous
    // requests freeze Android.  This is the ONLY place we call it.
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") return null;

    // ── 2. Get Expo push token (with timeout) ─────────────────────────────────
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
    }).catch(() => {
      // Silent failure — push notifications unavailable
    });

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
