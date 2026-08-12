---
name: Android push notifications + EAS CI
description: How Android FCM push notifications are wired in the Expo WebView app, and EAS build CI gotchas.
---

# Android push notifications + EAS CI

## Push notification architecture

**Why:** The Expo app wraps flexamarket.com in a WebView. Push tokens must be registered natively and injected into the WebView so the website can POST them to the backend.

**How it works:**
1. `artifacts/mobile/hooks/usePushNotifications.ts` — requests FCM permission, gets Expo push token, injects into WebView via `injectJavaScript`
2. `artifacts/mobile/App.tsx` — calls the hook with a `useCallback` injector; re-injects token on every `onLoadEnd` (handles navigation + token-before-page-load race)
3. Website `useExpoPushToken.ts` picks up `window.__expoPushToken` and POSTs to `/api/push/expo-token`
4. Backend `expo-push.ts` delivers via `https://exp.host/--/api/v2/push/send` → FCM

**Token race:** Token may arrive before WebView finishes loading. Solution: store pending script in `pendingScript` ref, drain it on `onLoadEnd`. Always re-inject on `onLoadEnd` for page navigations.

**How to apply:** Any future change to push token flow must update BOTH the hook AND the `onLoadEnd` re-injection in App.tsx, or token gets lost on navigation.

## EAS CI workflow gotchas

**pnpm version conflict:** Root `package.json` has `"packageManager": "pnpm@10.26.1"`. Do NOT use `pnpm/action-setup@v4` with a version field — it conflicts. Use `corepack enable && corepack prepare pnpm@10.26.1 --activate` instead.

**frozen-lockfile in CI:** pnpm v10 auto-enables `--frozen-lockfile` when `CI=true`. Moving packages from devDependencies → dependencies updates the lockfile's importer section. Must pass `--no-frozen-lockfile` explicitly in CI or the install fails.

**google-play-key.json:** NOT committed to the repo (gitignored via `*.key` pattern). `eas submit --auto-submit` will fail asking for it interactively. Build without `--auto-submit`; user uploads AAB manually from expo.dev to Google Play Console. Task #128 tracks adding it as a GitHub secret.

**AAB vs APK:** AABs cannot be sideloaded directly. Must go through Google Play Console → Internal testing track → Google converts to APK for distribution.

**Apple upload limit (iOS):** ~3 successful uploads per Pacific calendar day. Limit resets at midnight Pacific (07:00 UTC). Parallel pushes within the same minute cause 409 SHA conflicts — push files sequentially.
