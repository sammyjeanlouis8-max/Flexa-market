import { getApiBaseUrl } from "@/lib/config";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiFetchOptions = {
  token?: string | null;
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};

/**
 * Authenticated JSON helper for native screens.
 * Talks to the existing DigitalOcean API only — does not change backend logic.
 */
export async function apiFetch<T>(
  path: string,
  { token, method = "GET", body, signal }: ApiFetchOptions = {},
): Promise<T> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${getApiBaseUrl()}${normalized}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text || `Request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      message = parsed.error || parsed.message || message;
    } catch {
      /* keep text */
    }
    throw new ApiError(message, res.status, text);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
