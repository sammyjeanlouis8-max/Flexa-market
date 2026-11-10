/**
 * Privacy blocks — GET /users/me/blocks, DELETE unblock.
 */
import { getApiBase } from "./api";

type AuthOpts = { token: string };

export type BlockedUser = {
  id: number;
  name?: string;
  avatar?: string | null;
  blockedAt?: string;
};

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchBlockedUsers(opts: AuthOpts): Promise<BlockedUser[]> {
  const res = await fetch(`${getApiBase()}/users/me/blocks`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${opts.token}` },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Blocks failed (${res.status})`);
  return Array.isArray(data.blocks) ? data.blocks : Array.isArray(data) ? data : [];
}

export async function unblockUser(userId: number, opts: AuthOpts): Promise<void> {
  const res = await fetch(`${getApiBase()}/users/${userId}/block`, {
    method: "DELETE",
    headers: { Accept: "application/json", Authorization: `Bearer ${opts.token}` },
  });
  if (res.ok || res.status === 204) return;
  const data = await readJson(res);
  throw new Error(data.error || `Unblock failed (${res.status})`);
}
