/**
 * Project-local Expo Router context.
 *
 * Under pnpm, babel inlines EXPO_ROUTER_APP_ROOT as a long relative path from
 * the hoisted expo-router package into artifacts/mobile/app. Metro then emits
 * context keys like `../../../../../../artifacts/mobile/app/(tabs)/index.tsx`,
 * so `/` becomes an unmatched route.
 *
 * require.context from this file (next to app/) yields normal `./(tabs)/…` keys.
 */
export const ctx = require.context(
  "../app",
  true,
  /^(?:\.\/)(?!(?:(?:(?:.*\+api)|(?:\+html)|(?:\+middleware)))\.[tj]sx?$).*(?:\.ios|\.android|\.web)?\.[tj]sx?$/,
  "sync",
);
