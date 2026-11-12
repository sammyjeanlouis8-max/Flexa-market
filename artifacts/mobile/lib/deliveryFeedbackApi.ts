/**
 * Post-delivery tip + driver rating — same DigitalOcean APIs as web TipModal / DriverRatingModal.
 */
import { getApiBase } from "./api";

type AuthOpts = { token: string };

async function authed(
  path: string,
  opts: AuthOpts & { method?: string; body?: unknown },
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${opts.token}`,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function tipDriver(
  deliveryId: number,
  input: { amount: number; message?: string; rating?: number },
  opts: AuthOpts,
): Promise<{ ok: boolean; error?: string; alreadyTipped?: boolean }> {
  const res = await authed(`/delivery/${deliveryId}/tip`, {
    ...opts,
    method: "POST",
    body: {
      amount: input.amount,
      ...(input.message ? { message: input.message } : {}),
      ...(input.rating != null ? { rating: input.rating } : {}),
    },
  });
  const data = await readJson(res);
  if (!res.ok) {
    return {
      ok: false,
      error: data.error || `Tip failed (${res.status})`,
      alreadyTipped: Boolean(data.alreadyTipped),
    };
  }
  return { ok: true };
}

export async function rateDriver(
  deliveryId: number,
  input: { rating: number; comment?: string },
  opts: AuthOpts,
): Promise<{ ok: boolean; error?: string; alreadyRated?: boolean }> {
  const res = await authed(`/delivery/${deliveryId}/rate-driver`, {
    ...opts,
    method: "POST",
    body: {
      rating: input.rating,
      ...(input.comment ? { comment: input.comment } : {}),
    },
  });
  const data = await readJson(res);
  if (!res.ok) {
    return {
      ok: false,
      error: data.error || `Rating failed (${res.status})`,
      alreadyRated: Boolean(data.alreadyRated),
    };
  }
  return { ok: true };
}

export async function fetchTipStatus(
  deliveryId: number,
  opts: AuthOpts,
): Promise<{ tipped?: boolean; amount?: number } | null> {
  const res = await authed(`/delivery/${deliveryId}/tip-status`, opts);
  if (!res.ok) return null;
  return readJson(res);
}
