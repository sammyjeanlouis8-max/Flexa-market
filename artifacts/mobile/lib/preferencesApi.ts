/**
 * Notification preferences — GET/PUT /api/users/me/preferences.
 */
import { getApiBase } from "./api";

type AuthOpts = { token: string };

export type UserPreferences = {
  notifyPush: boolean;
  notifyEmail: boolean;
  notifySms: boolean;
};

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchUserPreferences(opts: AuthOpts): Promise<UserPreferences> {
  const res = await fetch(`${getApiBase()}/users/me/preferences`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${opts.token}` },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Preferences failed (${res.status})`);
  return {
    notifyPush: data.notifyPush !== false,
    notifyEmail: data.notifyEmail !== false,
    notifySms: data.notifySms !== false,
  };
}

export async function updateUserPreferences(
  patch: Partial<UserPreferences>,
  opts: AuthOpts,
): Promise<UserPreferences> {
  const res = await fetch(`${getApiBase()}/users/me/preferences`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify(patch),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Update preferences failed (${res.status})`);
  return {
    notifyPush: data.notifyPush !== false,
    notifyEmail: data.notifyEmail !== false,
    notifySms: data.notifySms !== false,
  };
}
