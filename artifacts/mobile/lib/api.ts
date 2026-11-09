import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "flexamarket_token";
const COUNTRY_KEY = "flexamarket_marketplace_country";

/** Production Flexa Market API. Override with EXPO_PUBLIC_DOMAIN for staging. */
export function getBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  // Prefer the public website API origin so native and web share one backend.
  return "https://flexamarket.com/api";
}

export async function getStoredToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function getMarketplaceCountry(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(COUNTRY_KEY);
    if (stored && stored.length === 2) return stored.toUpperCase();
  } catch {
    /* ignore */
  }
  return "HT";
}

export async function setMarketplaceCountry(country: string): Promise<void> {
  await AsyncStorage.setItem(COUNTRY_KEY, country.toUpperCase());
}

export type ApiFetchOptions = RequestInit & {
  token?: string | null;
  /** When true, attach Authorization if a token is available. */
  auth?: boolean;
};

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { token, auth = false, headers, ...rest } = options;
  const resolvedToken = token ?? (auth ? await getStoredToken() : null);
  const nextHeaders = new Headers(headers);
  if (!nextHeaders.has("Accept")) nextHeaders.set("Accept", "application/json");
  if (resolvedToken) nextHeaders.set("Authorization", `Bearer ${resolvedToken}`);
  if (rest.body && !nextHeaders.has("Content-Type")) {
    nextHeaders.set("Content-Type", "application/json");
  }
  return fetch(`${getBaseUrl()}${path}`, {
    ...rest,
    headers: nextHeaders,
  });
}

export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/api/")) return `https://flexamarket.com${url}`;
  if (url.startsWith("/")) return `https://flexamarket.com${url}`;
  return url;
}
