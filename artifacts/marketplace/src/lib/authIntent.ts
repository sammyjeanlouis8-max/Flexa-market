/**
 * Stash a restricted marketplace action so it can resume after login/signup.
 * Cleared after one successful consume to avoid duplicate cart/orders.
 */

export const AUTH_INTENT_KEY = "flexamarket_auth_intent";

export type AuthIntentAction =
  | "addToCart"
  | "buyNow"
  | "contactSeller"
  | "favorite"
  | "checkout"
  | "generic";

export type AuthIntent = {
  action: AuthIntentAction;
  /** Path to return to after auth (must be same-origin relative) */
  next: string;
  listingId?: number;
  sellerId?: number;
  quantity?: number;
  title?: string;
  price?: number;
  currency?: string | null;
  image?: string | null;
  country?: string | null;
  createdAt: number;
};

const MAX_AGE_MS = 30 * 60 * 1000;

function isSafeNext(next: string): boolean {
  return next.startsWith("/") && !next.startsWith("//");
}

export function saveAuthIntent(intent: Omit<AuthIntent, "createdAt">): void {
  if (!isSafeNext(intent.next)) return;
  try {
    const payload: AuthIntent = { ...intent, createdAt: Date.now() };
    sessionStorage.setItem(AUTH_INTENT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function peekAuthIntent(): AuthIntent | null {
  try {
    const raw = sessionStorage.getItem(AUTH_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthIntent;
    if (!parsed?.action || !parsed?.next || !isSafeNext(parsed.next)) return null;
    if (Date.now() - (parsed.createdAt ?? 0) > MAX_AGE_MS) {
      clearAuthIntent();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Read and clear — prevents duplicate add-to-cart / order after auth. */
export function consumeAuthIntent(): AuthIntent | null {
  const intent = peekAuthIntent();
  clearAuthIntent();
  return intent;
}

export function clearAuthIntent(): void {
  try {
    sessionStorage.removeItem(AUTH_INTENT_KEY);
  } catch {
    /* ignore */
  }
}

/** Build login/register URL preserving return path. */
export function authPathWithNext(path: "/auth/login" | "/auth/register", next: string): string {
  const safe = isSafeNext(next) ? next : "/";
  return `${path}?next=${encodeURIComponent(safe)}`;
}
