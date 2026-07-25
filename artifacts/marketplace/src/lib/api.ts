/**
 * Tiny fetch wrapper that automatically attaches the auth bearer token
 * from localStorage and parses JSON. Use it for endpoints that don't yet
 * have a generated react-query hook (e.g. the support feature).
 */
const TOKEN_KEY = "flexamarket_token";

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function buildUrl(path: string): string {
  // BASE_URL ends with a slash (e.g. "/marketplace/" or "/"). The api is
  // proxied by the marketplace dev server at the same base.
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  const res = await fetch(buildUrl(path), { ...init, headers });
  const text = await res.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body && body.error) ||
      `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}
