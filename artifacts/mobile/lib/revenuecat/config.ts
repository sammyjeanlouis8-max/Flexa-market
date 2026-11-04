/**
 * RevenueCat Apple PUBLIC SDK key (appl_…).
 * This is the same key already shipped in ios-native Info.plist.
 * Never put the RevenueCat SECRET key (sk_…) in the mobile app.
 */
const PUBLIC_APPLE_SDK_KEY_FALLBACK = "appl_uwCdAGjnZnpJgnwhOKCFHRYMewP";

export function getRevenueCatApplePublicApiKey(): string {
  const fromEnv = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY?.trim();
  if (fromEnv) {
    if (fromEnv.startsWith("sk_")) {
      throw new Error(
        "EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY must be the public appl_ key, not the secret sk_ key.",
      );
    }
    return fromEnv;
  }
  return PUBLIC_APPLE_SDK_KEY_FALLBACK;
}

export function assertPublicRevenueCatKey(key: string): void {
  if (!key.startsWith("appl_")) {
    throw new Error(
      "RevenueCat iOS SDK key must be the public appl_ key. Secret keys are server-only.",
    );
  }
  if (key.includes("$(") || key.includes("SECRET")) {
    throw new Error("Invalid RevenueCat public API key placeholder.");
  }
}
