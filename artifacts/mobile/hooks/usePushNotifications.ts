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

const API_BASE = "https://bonjour-tool.replit.app";

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Flexa Market",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#F97316",
      sound: "default",
    });
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e",
    });
    return tokenData.data;
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
        injectJs(
          `(function(){window.__expoPushToken=${JSON.stringify(token)};` +
          `if(typeof window.__onExpoPushToken==='function')window.__onExpoPushToken(${JSON.stringify(token)});` +
          `})();true;`
        );
      }
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
