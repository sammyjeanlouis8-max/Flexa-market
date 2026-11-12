/**
 * Registers Expo push token after auth and routes notification taps
 * into native Expo Router screens (chat, orders, wallet, …).
 * Cold start: getLastNotificationResponseAsync opens the correct screen
 * even when the app was killed.
 */
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { pathFromNotificationData } from "@/lib/notificationDeepLink";
import { registerExpoPushToken } from "@/lib/pushPrep";

export function PushBootstrap() {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const lastJwt = useRef<string | null>(null);
  const handledResponseId = useRef<string | null>(null);
  const pendingPath = useRef<string | null>(null);

  useEffect(() => {
    if (!token || token === lastJwt.current) return;
    lastJwt.current = token;
    void registerExpoPushToken(token);
  }, [token]);

  useEffect(() => {
    const go = (data: Record<string, unknown> | undefined, responseId?: string | null) => {
      if (responseId && handledResponseId.current === responseId) return;
      const path = pathFromNotificationData(data);
      if (!path) return;
      if (responseId) handledResponseId.current = responseId;
      // Wait for auth restore so protected routes do not bounce to login incorrectly.
      if (isLoading) {
        pendingPath.current = path;
        return;
      }
      router.push(path as any);
    };

    const subRecv = Notifications.addNotificationReceivedListener(() => {
      /* foreground display handled by setNotificationHandler in pushPrep */
    });

    const subResp = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      go(data, response.notification.request.identifier);
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      go(data, response.notification.request.identifier);
    });

    return () => {
      subRecv.remove();
      subResp.remove();
    };
  }, [router, isLoading]);

  useEffect(() => {
    if (isLoading) return;
    if (!pendingPath.current) return;
    const path = pendingPath.current;
    pendingPath.current = null;
    router.push(path as any);
  }, [isLoading, router]);

  return null;
}
