import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// NOTE: do NOT import `router` from "expo-router" at the top of this module.
// pushTokens.ts is reachable from the root layout's startup path; an eager
// import of expo-router's imperative-api here triggers React-Navigation
// internal evaluation before the root host is mounted, which on Android
// produced the cold-start crash "FlexaMarket keeps stopping". `router` is
// only used inside the notification-response listener (fires only when the
// user taps a notification, long after mount) so it is safely require()'d
// there on demand.

const EXPO_PROJECT_ID = "45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e";

// Module-level cache so the token survives across screen mounts. The previous
// implementation held the token in a per-mount ref inside (tabs)/index.tsx —
// when the user navigated away from home and back, the ref was reset and the
// token had to be re-fetched, which on Android with FCM throttling could fail.
let cachedToken: string | null = null;
const tokenListeners = new Set<(t: string | null) => void>();

function setToken(t: string | null) {
  cachedToken = t;
  for (const fn of tokenListeners) {
    try {
      fn(t);
    } catch {
      /* listener errors must never break the push pipeline */
    }
  }
}

export function getCachedPushToken(): string | null {
  return cachedToken;
}

export function subscribePushToken(fn: (t: string | null) => void): () => void {
  tokenListeners.add(fn);
  // Fire immediately so late subscribers get the current value.
  if (cachedToken) {
    try {
      fn(cachedToken);
    } catch {}
  }
  return () => {
    tokenListeners.delete(fn);
  };
}

/**
 * Build the JS string that exposes the token to the WebView and invokes the
 * web app's `__onExpoPushToken` hook. Returns "" if no token is available
 * (caller can short-circuit). The script is idempotent: calling it twice
 * with the same token is a no-op on the web side.
 */
export function buildTokenInjectionScript(token: string | null): string {
  if (!token) return "";
  const jsToken = JSON.stringify(token);
  return `(function(){
    try {
      if (window.__expoPushToken === ${jsToken}) return;
      window.__expoPushToken = ${jsToken};
      if (typeof window.__onExpoPushToken === 'function') {
        window.__onExpoPushToken(${jsToken});
      }
    } catch (e) {}
  })();
  true;`;
}

/**
 * Build the JS string that fires the web app's deep-link handler with a URL
 * that the user reached by tapping a notification while the WebView is
 * already mounted on screen.
 */
function buildDeepLinkScript(url: string): string {
  const jsUrl = JSON.stringify(url);
  return `(function(){
    try {
      if (typeof window.__handlePushUrl === 'function') {
        window.__handlePushUrl(${jsUrl});
      } else {
        // Fallback: navigate the WebView directly.
        window.location.assign(${jsUrl});
      }
    } catch (e) {}
  })();
  true;`;
}

async function ensurePermissionAndChannel(): Promise<boolean> {
  if (!Device.isDevice) return false;

  // PUSH-AUDIT defect #5 (iOS permission options).
  // Calling requestPermissionsAsync() with no options on iOS grants the
  // OS-default "provisional" permission, which delivers notifications
  // silently to the Notification Center but never shows the alert banner.
  // Users report this as "I'm not getting notifications". We explicitly
  // request alert + badge + sound so the user sees the standard prompt
  // and the granted permission level matches expectations.
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    status = req.status;
  }
  if (status !== "granted") return false;

  if (Platform.OS === "android") {
    // Channel must be created before the first notification is delivered;
    // doing this every cold-start is safe (channel creation is idempotent).
    await Notifications.setNotificationChannelAsync("default", {
      name: "Flexa Market",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#F97316",
      sound: "default",
    });
  }
  return true;
}

async function fetchExpoToken(): Promise<string | null> {
  try {
    const data = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });
    return data.data;
  } catch {
    return null;
  }
}

// Whether the push-pipeline has already been initialised in this JS context.
let initialised = false;

/**
 * Initialise the push notification pipeline. Idempotent: safe to call
 * multiple times — only the first call performs work.
 *
 *  1. Requests permission + creates the Android notification channel.
 *  2. Fetches the current Expo push token and publishes it via setToken().
 *  3. Listens for OS-initiated token refresh (addPushTokenListener) and
 *     republishes the refreshed token. The previous implementation NEVER
 *     re-fetched the token, so a refreshed token was silently lost and
 *     server-side push for that device would stop working.
 *  4. Listens for foreground notifications (addNotificationReceivedListener)
 *     so analytics and badge state can react without depending on the OS
 *     showing the alert.
 *  5. Listens for notification taps (addNotificationResponseReceivedListener)
 *     and routes the user. If a `url` is present in the data payload we
 *     navigate the user into the website tab; if a SafeWebView is already
 *     mounted there it will receive the deep-link via window.__handlePushUrl.
 */
export function initPushNotifications(): void {
  if (initialised) return;
  initialised = true;

  // Install the global notification handler now (after layout mount) rather
  // than at module load — see the import-block comment for the Android
  // crash rationale.
  //
  // PUSH-AUDIT defect #6 (deprecated handler API).
  // expo-notifications ≥ 0.27 split `shouldShowAlert` into the more
  // specific `shouldShowBanner` (full alert) and `shouldShowList` (entry
  // in the Notification Center). On iOS 14+, supplying ONLY the legacy
  // `shouldShowAlert` results in no banner being shown when the app is
  // in the foreground — users reported "notifications never appear while
  // the app is open". We supply both the modern keys AND the legacy one
  // so the handler works across every expo-notifications version we
  // might be bundled against.
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch {
    /* native module not ready — push will fall back to OS defaults */
  }

  // Permission + initial token (fire-and-forget; the function itself never
  // throws because all branches are caught).
  void (async () => {
    const ok = await ensurePermissionAndChannel();
    if (!ok) return;
    const token = await fetchExpoToken();
    if (token) setToken(token);
  })();

  // Token refresh: republish whenever the OS issues a new token. We also
  // listen on the EAS-managed APNs/FCM channel; expo-notifications fires
  // this listener for both providers.
  try {
    Notifications.addPushTokenListener((event) => {
      if (event?.data && typeof event.data === "string") {
        setToken(event.data);
      }
    });
  } catch {
    /* listener API not yet available — refresh will be lost this session */
  }

  // Foreground notifications: handler already set above provides the alert;
  // this listener is here so the rest of the app can hook into receive
  // events in the future without changing this module.
  try {
    Notifications.addNotificationReceivedListener(() => {
      /* intentionally a no-op today */
    });
  } catch {
    /* listener API not yet available */
  }

  // Notification taps: navigate to website tab with the deep-link URL.
  // Per product decision: all push-tap routing goes through the WebView.
  try {
    Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data as
        | { url?: string }
        | undefined;
      const url = typeof data?.url === "string" ? data.url : null;
      if (!url) return;
      try {
        // Lazy-require expo-router only when we actually need to navigate.
        // Top-level import here triggered the Android startup crash; tap
        // handlers fire only well after the layout is mounted so the
        // require is always safe.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { router } = require("expo-router");
        router.push(`/website?url=${encodeURIComponent(url)}`);
      } catch {
        /* router not ready or expo-router shape changed — drop the tap */
      }
    });
  } catch {
    /* listener API not yet available */
  }
}

export const __pushInternal = {
  buildDeepLinkScript, // exposed for tests / future direct WebView wiring
};
