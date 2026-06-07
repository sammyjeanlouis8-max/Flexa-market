import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";

// ─────────────────────────────────────────────────────────────────────────────
// Global push handler — must be installed exactly once at module load, BEFORE
// any subscription listeners fire. Setting it from inside a hook's useEffect
// (the previous implementation) created a race where a notification arriving
// during cold-start could be processed with the default handler (sound off).
// ─────────────────────────────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
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
  Notifications.addPushTokenListener((event) => {
    if (event?.data && typeof event.data === "string") {
      setToken(event.data);
    }
  });

  // Foreground notifications: handler already set above provides the alert;
  // this listener is here so the rest of the app can hook into receive
  // events in the future without changing this module.
  Notifications.addNotificationReceivedListener(() => {
    /* intentionally a no-op today */
  });

  // Notification taps: navigate to website tab with the deep-link URL.
  // Per product decision: all push-tap routing goes through the WebView.
  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data as
      | { url?: string }
      | undefined;
    const url = typeof data?.url === "string" ? data.url : null;
    if (!url) return;
    try {
      // Push the website screen with the target URL; if the website screen
      // is already on top, expo-router will replace its params and the
      // SafeWebView will navigate via its onLoad-time token-injection path
      // (the script is also re-injected on every load).
      router.push(`/website?url=${encodeURIComponent(url)}`);
    } catch {
      /* router not ready */
    }
  });
}

export const __pushInternal = {
  buildDeepLinkScript, // exposed for tests / future direct WebView wiring
};
