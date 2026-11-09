/**
 * Flexa Market — native Expo Router entry (Phase 2 corrective path).
 *
 * Google Play suspended com.flexa.market (version code 48) for Webviews and
 * Affiliate Spam because the prior binary was a WebView shell. Primary UI
 * must be genuine React Native screens. The legacy WebView shell lives in
 * LegacyWebViewShell.tsx and is NOT registered as the root component.
 */
import "expo-router/entry";
