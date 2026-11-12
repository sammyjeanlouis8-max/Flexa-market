/**
 * Registers Expo push token after auth and routes notification taps
 * into native Expo Router screens. Syncs in-app inbox marks on tap when
 * a notificationId is present — does not invent inbox rows (server is SoT).
 *
 * Cold start: getLastNotificationResponseAsync opens the correct screen.
 * Pending path waits for auth restore so protected routes do not bounce
 * to login incorrectly.
 */
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useAuth } from "@/context/AuthContext";
import {
  notificationIdFromPushData,
  pathFromNotificationData,
} from "@/lib/notificationDeepLink";
import { markNotificationRead } from "@/lib/notificationsApi";
import { registerExpoPushToken } from "@/lib/pushPrep";

export function PushBootstrap() {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const lastJwt = useRef<string | null>(null);
  const handledResponseIds = useRef<Set<string>>(new Set());
  const pendingPath = useRef<string | null>(null);

  useEffect(() => {
    if (!token || token === lastJwt.current) return;
    lastJwt.current = token;
    void registerExpoPushToken(token);
  }, [token]);

  useEffect(() => {
    // Push APIs are native-only; skip listeners on web so Expo web smoke tests work.
    if (Platform.OS === "web") return;

    const go = async (
      data: Record<string, unknown> | undefined,
      responseKey?: string,
    ) => {
      if (responseKey) {
        if (handledResponseIds.current.has(responseKey)) return;
        handledResponseIds.current.add(responseKey);
        if (handledResponseIds.current.size > 40) {
          const first = handledResponseIds.current.values().next().value;
          if (first) handledResponseIds.current.delete(first);
        }
      }

      const notifId = notificationIdFromPushData(data);
      if (notifId && token) {
        void markNotificationRead(notifId, { token }).catch(() => {});
      }

      const path = pathFromNotificationData(data);
      if (!path) return;

      // Wait for auth restore so protected routes do not bounce to login incorrectly.
      if (isLoading) {
        pendingPath.current = path;
        return;
      }
      router.push(path as any);
    };

    const subRecv = Notifications.addNotificationReceivedListener(() => {
      /* Foreground display only — inbox remains API-backed. */
    });

    const subResp = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      const key =
        response.notification.request.identifier ||
        `${response.notification.date}`;
      void go(data, `tap:${key}`);
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      const key =
        response.notification.request.identifier ||
        `${response.notification.date}`;
      void go(data, `cold:${key}`);
    });

    return () => {
      subRecv.remove();
      subResp.remove();
    };
  }, [router, token, isLoading]);

  useEffect(() => {
    if (isLoading) return;
    if (!pendingPath.current) return;
    const path = pendingPath.current;
    pendingPath.current = null;
    router.push(path as any);
  }, [isLoading, router]);

  return null;
}
