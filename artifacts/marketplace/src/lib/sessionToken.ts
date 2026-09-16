const TOKEN_KEY = "flexamarket_token";
const LEGACY_TOKEN_KEY = "bazarhub_token";
const USER_CACHE_KEY = "flexamarket_session_user";
const TOKEN_COOKIE = "fm_token";
const COOKIE_MAX_AGE = 365 * 24 * 3600;

let initialized = false;
let currentToken: string | null = null;

function tokenFingerprint(token: string): string {
  // Non-secret binding key: this is only used to prevent a cached user from
  // being restored for a different token. The JWT itself remains in its
  // existing token storage and is never duplicated into the user cache.
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${token.length}:${(hash >>> 0).toString(16)}`;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The in-memory token remains authoritative for the current app session.
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // The in-memory token remains authoritative for the current app session.
  }
}

function readCookieToken(): string | null {
  try {
    const entry = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${TOKEN_COOKIE}=`));
    return entry ? decodeURIComponent(entry.split("=").slice(1).join("=")) : null;
  } catch {
    return null;
  }
}

function writeCookieToken(token: string): void {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  } catch {
    // The in-memory token remains authoritative for the current app session.
  }
}

function clearCookieToken(): void {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
  } catch {
    // The in-memory token is already cleared.
  }
}

export function restoreSessionToken(): string | null {
  if (initialized) return currentToken;

  const stored = readStorage(TOKEN_KEY);
  const legacy = stored ? null : readStorage(LEGACY_TOKEN_KEY);
  const cookie = stored || legacy ? null : readCookieToken();
  currentToken = stored ?? legacy ?? cookie;
  initialized = true;

  if (currentToken) {
    writeStorage(TOKEN_KEY, currentToken);
    writeCookieToken(currentToken);
  }
  if (legacy) removeStorage(LEGACY_TOKEN_KEY);

  return currentToken;
}

export function getCurrentSessionToken(): string | null {
  return initialized ? currentToken : restoreSessionToken();
}

export function setCurrentSessionToken(token: string | null): void {
  const tokenChanged = initialized && currentToken !== token;
  initialized = true;
  currentToken = token;

  if (token) {
    if (tokenChanged) removeStorage(USER_CACHE_KEY);
    writeStorage(TOKEN_KEY, token);
    writeCookieToken(token);
    return;
  }

  removeStorage(TOKEN_KEY);
  removeStorage(LEGACY_TOKEN_KEY);
  removeStorage(USER_CACHE_KEY);
  clearCookieToken();
}

export function restoreSessionUser<T>(): T | null {
  const token = getCurrentSessionToken();
  if (!token) return null;
  const raw = readStorage(USER_CACHE_KEY);
  if (!raw) return null;
  try {
    const cached = JSON.parse(raw) as { tokenFingerprint?: unknown; user?: unknown };
    if (
      cached.tokenFingerprint !== tokenFingerprint(token) ||
      !cached.user ||
      typeof cached.user !== "object"
    ) {
      removeStorage(USER_CACHE_KEY);
      return null;
    }
    return cached.user as T;
  } catch {
    removeStorage(USER_CACHE_KEY);
    return null;
  }
}

export function setCurrentSessionUser(user: unknown | null, token = getCurrentSessionToken()): void {
  if (!user) {
    removeStorage(USER_CACHE_KEY);
    return;
  }
  if (!token) return;
  try {
    writeStorage(USER_CACHE_KEY, JSON.stringify({
      tokenFingerprint: tokenFingerprint(token),
      user,
    }));
  } catch {
    // The current React session still retains the verified user in memory.
  }
}