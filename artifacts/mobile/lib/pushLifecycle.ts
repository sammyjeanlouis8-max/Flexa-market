/**
 * Pure helpers for Expo push token lifecycle (testable without native modules).
 */

export function isExpoPushTokenFormat(token: string | null | undefined): boolean {
  if (!token || typeof token !== "string") return false;
  return token.startsWith("ExponentPushToken") || token.startsWith("Expo");
}

export type LogoutTokenCleanup = {
  shouldUnregister: boolean;
  expoToken: string | null;
  authJwtToUse: string | null;
};

/**
 * When JWT transitions from set → null (logout), unregister the device token
 * using the previous JWT. Never unregister with an empty auth header.
 */
export function planLogoutTokenCleanup(args: {
  previousJwt: string | null;
  nextJwt: string | null;
  expoToken: string | null;
}): LogoutTokenCleanup {
  const { previousJwt, nextJwt, expoToken } = args;
  const shouldUnregister = Boolean(previousJwt && !nextJwt && isExpoPushTokenFormat(expoToken));
  return {
    shouldUnregister,
    expoToken: shouldUnregister ? expoToken : null,
    authJwtToUse: shouldUnregister ? previousJwt : null,
  };
}

export type TokenRegisterPlan = {
  shouldRegister: boolean;
  reason: string;
};

export function planTokenRegistration(args: {
  expoToken: string | null;
  authJwt: string | null;
  permissionGranted: boolean;
  firebaseConfiguredForPackage: boolean;
}): TokenRegisterPlan {
  if (!args.firebaseConfiguredForPackage) {
    return { shouldRegister: false, reason: "firebase_android_app_missing" };
  }
  if (!args.permissionGranted) {
    return { shouldRegister: false, reason: "notification_permission_denied" };
  }
  if (!isExpoPushTokenFormat(args.expoToken)) {
    return { shouldRegister: false, reason: "invalid_or_missing_expo_token" };
  }
  if (!args.authJwt) {
    return { shouldRegister: false, reason: "user_not_authenticated" };
  }
  return { shouldRegister: true, reason: "ready" };
}
