import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useAuth, getBaseUrl } from "@/context/AuthContext";

const PROJECT_ID = "45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? PROJECT_ID;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch {
    return null;
  }
}

export function usePushNotifications() {
  const { token: authToken, user } = useAuth();
  const router = useRouter();
  const registeredToken = useRef<string | null>(null);
  const notifListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (!user || !authToken) return;

    let cancelled = false;

    (async () => {
      const pushToken = await registerForPushNotificationsAsync();
      if (!pushToken || cancelled) return;

      registeredToken.current = pushToken;

      try {
        await fetch(`${getBaseUrl()}/api/push/expo-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            token: pushToken,
            platform: Platform.OS,
            deviceId: Device.deviceName ?? null,
          }),
        });
      } catch {}
    })();

    notifListener.current = Notifications.addNotificationReceivedListener(
      (_notification) => {
      },
    );

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as any;
        if (!data?.screen) return;

        const screen = data.screen as string;
        const params = data.params as Record<string, string> | undefined;

        if (screen === "messages" && params?.conversationId) {
          router.push(`/messages/${params.conversationId}` as any);
        } else if (screen === "offers") {
          router.push("/(tabs)/offers" as any);
        } else if (screen === "notifications") {
          router.push("/(tabs)/notifications" as any);
        } else if (screen === "listing" && params?.listingId) {
          router.push(`/listing/${params.listingId}` as any);
        }
      });

    return () => {
      cancelled = true;
      notifListener.current?.remove();
      responseListener.current?.remove();

      if (registeredToken.current && authToken) {
        fetch(`${getBaseUrl()}/api/push/expo-token`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ token: registeredToken.current }),
        }).catch(() => {});
      }
    };
  }, [user?.id, authToken]);
}
