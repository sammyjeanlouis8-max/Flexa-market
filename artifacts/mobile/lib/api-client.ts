/**
 * Boots the shared Orval React Query client for Expo.
 *
 * Uses existing @workspace/api-client-react helpers only.
 * Does not alter API server auth or payment logic.
 */
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

import { readAuthToken } from "@/lib/auth-storage";
import { getApiBaseUrl, getApiOrigin } from "@/lib/config";

let configured = false;

/**
 * Configure base URL + bearer token getter once at app start.
 * Safe to call multiple times (idempotent).
 */
export function configureApiClient(): void {
  setBaseUrl(getApiOrigin());
  setAuthTokenGetter(() => readAuthToken());
  configured = true;
}

export function isApiClientConfigured(): boolean {
  return configured;
}

export type ApiHealthResult =
  | { ok: true; status: number; latencyMs: number; body?: unknown }
  | { ok: false; status?: number; latencyMs: number; error: string };

/** Lightweight connectivity check against the existing public health endpoint. */
export async function checkApiHealth(
  timeoutMs = 10_000,
): Promise<ApiHealthResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${getApiBaseUrl()}/healthz`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const latencyMs = Date.now() - started;
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        latencyMs,
        error: `HTTP ${res.status}`,
      };
    }
    return { ok: true, status: res.status, latencyMs, body };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const message =
      error instanceof Error ? error.message : "Network request failed";
    return { ok: false, latencyMs, error: message };
  } finally {
    clearTimeout(timer);
  }
}
