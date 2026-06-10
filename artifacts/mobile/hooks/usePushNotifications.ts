/**
   * Thin backwards-compatibility shim around `lib/pushTokens.ts`.
   *
   * IMPORTANT: `lib/pushTokens.ts` MUST be loaded lazily (dynamic import)
   * inside a useEffect, never at module top.  A static import here would be
   * pulled in when index.tsx is evaluated, which happens before the root layout
   * has rendered — on Android that causes an immediate startup crash
   * ("FlexaMarket keeps stopping") because expo-notifications and expo-device
   * initialise native bridges that are not yet ready at that point.
   * This is the same reason _layout.tsx uses a dynamic import for pushTokens.
   */

  import { useEffect } from "react";

  export function usePushNotifications(injectJs?: (script: string) => void) {
    useEffect(() => {
      let cleanup: (() => void) | undefined;
      let mounted = true;

      void (async () => {
        try {
          const {
            buildTokenInjectionScript,
            getCachedPushToken,
            initPushNotifications,
            subscribePushToken,
          } = await import("../lib/pushTokens");

          if (!mounted) return;

          // Idempotent — safe to call from any number of screens.
          initPushNotifications();

          if (injectJs) {
            // Inject current token immediately so the WebView can register it.
            const initial = getCachedPushToken();
            if (initial) {
              injectJs(buildTokenInjectionScript(initial));
            }
            // Re-inject whenever the token changes (refresh, permission grant).
            cleanup = subscribePushToken((token) => {
              if (token && mounted) injectJs(buildTokenInjectionScript(token));
            });
          }
        } catch {
          // Any failure in push init must never crash the screen.
          // Push will simply not work for this session.
        }
      })();

      return () => {
        mounted = false;
        cleanup?.();
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  }
  