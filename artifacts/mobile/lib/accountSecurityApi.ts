/**
 * Account security — change password + delete account.
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
    method: opts.method ?? "POST",
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

export async function changePassword(
  input: { currentPassword: string; newPassword: string },
  opts: AuthOpts,
): Promise<{ ok: true; token?: string } | { ok: false; error: string }> {
  const res = await authed("/auth/change-password", {
    ...opts,
    method: "POST",
    body: {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    },
  });
  const data = await readJson(res);
  if (!res.ok) return { ok: false, error: data.error || `Failed (${res.status})` };
  return { ok: true, token: typeof data.token === "string" ? data.token : undefined };
}

export async function deleteAccount(
  password: string,
  opts: AuthOpts,
): Promise<{ ok: boolean; error?: string }> {
  const res = await authed("/users/me", {
    ...opts,
    method: "DELETE",
    body: { password },
  });
  const data = await readJson(res);
  if (!res.ok) return { ok: false, error: data.error || `Delete failed (${res.status})` };
  return { ok: true };
}
