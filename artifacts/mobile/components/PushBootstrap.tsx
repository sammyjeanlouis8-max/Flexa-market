/**
 * Registers Expo push token after auth and routes notification taps
 * into native Expo Router screens. Syncs in-app inbox marks on tap when
 * a notificationId is present — does not invent inbox rows (server is SoT).
 */
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  notificationIdFromPushData,
  pathFromNotificationData,
} from "@/lib/notificationDeepLink";
import { markNotificationRead } from "@/lib/notificationsApi";
import { registerExpoPushToken } from "@/lib/pushPrep";

export function PushBootstrap() {
  const { token } = useAuth();
  const router = useRouter();
  const lastJwt = useRef<string | null>(null);
  const handledResponseIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!token || token === lastJwt.current) return;
    lastJwt.current = token;
    void registerExpoPushToken(token);
  }, [token]);

  useEffect(() => {
    const go = async (
      data: Record<string, unknown> | undefined,
      responseKey?: string,
    ) => {
      if (responseKey) {
        if (handledResponseIds.current.has(responseKey)) return;
        handledResponseIds.current.add(responseKey);
        // Bound memory for long sessions
        if (handledResponseIds.current.size > 40) {
          const first = handledResponseIds.current.values().next().value;
          if (first) handledResponseIds.current.delete(first);
        }
      }

      // Inbox sync: mark server notification read when push carries its id.
      // Never insert a local duplicate — inbox remains API-backed only.
      const notifId = notificationIdFromPushData(data);
      if (notifId && token) {
        void markNotificationRead(notifId, { token }).catch(() => {});
      }

      const path = pathFromNotificationData(data);
      if (path) router.push(path as any);
    };

    const subRecv = Notifications.addNotificationReceivedListener(() => {
      /* Foreground display: setNotificationHandler in pushPrep.
         Inbox rows are not duplicated here — Notifications screen
         refreshes from GET /api/notifications on focus. */
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
  }, [router, token]);

  return null;
}
