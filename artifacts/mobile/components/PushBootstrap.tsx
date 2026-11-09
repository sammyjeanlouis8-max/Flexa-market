/**
 * Registers Expo push token after auth and routes notification taps
 * into native Expo Router screens (chat, orders, wallet, …).
 * Does not invent credentials or claim delivery success.
 */
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { pathFromNotificationData } from "@/lib/notificationDeepLink";
import { registerExpoPushToken } from "@/lib/pushPrep";

export function PushBootstrap() {
  const { token } = useAuth();
  const router = useRouter();
  const lastJwt = useRef<string | null>(null);

  useEffect(() => {
    if (!token || token === lastJwt.current) return;
    lastJwt.current = token;
    void registerExpoPushToken(token);
  }, [token]);

  useEffect(() => {
    const go = (data: Record<string, unknown> | undefined) => {
      const path = pathFromNotificationData(data);
      if (path) router.push(path as any);
    };

    const subRecv = Notifications.addNotificationReceivedListener(() => {
      /* foreground display handled by setNotificationHandler in pushPrep */
    });

    const subResp = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      go(data);
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      go(data);
    });

    return () => {
      subRecv.remove();
      subResp.remove();
    };
  }, [router]);

  return null;
}
