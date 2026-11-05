/**
 * App Store Connect identity for the Expo iOS binary.
 *
 * Verified from repo sources (ios-native README, fastlane Appfile, project.yml,
 * Expo app.json, agent memory). Live ASC UI confirmation still required before
 * any TestFlight upload.
 *
 * Target app:
 * - Name in docs / Xcode: Flexa Market / FlexaMarket
 * - Bundle ID: com.flexamarket.mobile
 * - ASC App ID: 6754947270
 * - Marketing version line currently used in this repo: 1.0.1
 *
 * Latest known TestFlight build for this app (owner-reported): 100
 * Next Expo iOS buildNumber is pinned to exactly 101.
 * EAS production uses appVersionSource=local and autoIncrement=false so EAS
 * cannot rewrite that number unexpectedly.
 *
 * Live App Store Connect verification of the latest build is required before
 * any EAS build/submit (this environment has no ASC API credentials).
 *
 * The separate TestFlight listing "FlexaMarket (FM)" v1.0.2 build 96 is NOT
 * configured in this Expo package and must not be overwritten by accident.
 */
export const IOS_BUNDLE_IDENTIFIER = "com.flexamarket.mobile" as const;
export const ASC_APP_ID = "6754947270" as const;
export const APPLE_TEAM_ID = "D782MM56VY" as const;
export const IOS_MARKETING_VERSION = "1.0.1" as const;

/** Owner-reported latest TestFlight CFBundleVersion for com.flexamarket.mobile */
export const LATEST_KNOWN_TESTFLIGHT_BUILD = 100;

/** Exact next iOS build number to ship (must remain 101 until that build is used). */
export const NEXT_IOS_BUILD_NUMBER = 101;

/** @deprecated Use NEXT_IOS_BUILD_NUMBER — kept for older tests/call sites. */
export const MIN_NEXT_IOS_BUILD_NUMBER = NEXT_IOS_BUILD_NUMBER;
