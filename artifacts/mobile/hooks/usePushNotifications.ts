/**
 * Thin backwards-compatibility shim around `lib/pushTokens.ts`.
 *
 * Previously this hook was the single entry point for push registration and
 * had to be called from a screen that mounted a WebView (so it could
 * inject the token via the `injectJs` callback). That created two bugs:
 *
 *   1. If the user never visited the home tab, no token was ever fetched.
 *   2. The token was only stored in a per-mount ref, so navigating away and
 *      back lost it, and OS-initiated token refreshes were never observed.
 *
 * The real implementation now lives in `lib/pushTokens.ts` and is
 * initialised once from the root layout via `initPushNotifications()`.
 * Screens that mount a WebView can still call this hook to receive the
 * current token via `injectJs` whenever one is available — but the
 * registration pipeline no longer depends on the hook running.
 */

import { useEffect } from "react";
import {
  buildTokenInjectionScript,
  getCachedPushToken,
  initPushNotifications,
  subscribePushToken,
} from "../lib/pushTokens";

export function usePushNotifications(injectJs?: (script: string) => void) {
  useEffect(() => {
    // Idempotent — safe to call from any number of screens.
    initPushNotifications();

    // Inject the current token (if any) immediately so the WebView's
    // useExpoPushToken hook can register it with the API.
    if (injectJs) {
      const initial = getCachedPushToken();
      if (initial) {
        injectJs(buildTokenInjectionScript(initial));
      }
      // Re-inject whenever the token changes (refresh, permission grant).
      const unsubscribe = subscribePushToken((token) => {
        if (token) injectJs(buildTokenInjectionScript(token));
      });
      return unsubscribe;
    }
    return undefined;
  }, []);
}
