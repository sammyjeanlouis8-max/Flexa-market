/**
 * Flexa Market mobile — runtime configuration (Phase 0).
 *
 * API origin is used with @workspace/api-client-react (paths already include `/api/...`).
 * API base URL is used for manual fetches that append `/auth/me`, `/healthz`, etc.
 *
 * Production domain comes from EXPO_PUBLIC_DOMAIN (EAS sets flexamarket.com).
 * No production secrets or backend auth logic live here.
 */

const FALLBACK_HOST = "lionfish-app-feohg.ondigitalocean.app";

function resolveHost(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (domain && domain.length > 0) {
    return domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
  return FALLBACK_HOST;
}

/** Origin only — e.g. https://flexamarket.com */
export function getApiOrigin(): string {
  return `https://${resolveHost()}`;
}

/** API root — e.g. https://flexamarket.com/api */
export function getApiBaseUrl(): string {
  return `${getApiOrigin()}/api`;
}

/** Public website origin (compatibility WebView / deep links). */
export function getWebsiteOrigin(): string {
  return getApiOrigin();
}

export const AUTH_TOKEN_STORAGE_KEY = "flexamarket_token";

export const NATIVE_APP_PHASE = "0" as const;
