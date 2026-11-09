/**
 * Favorites — same DigitalOcean APIs as marketplace Saved page.
 * Country lock enforced server-side.
 */
import { getApiBase } from "./api";
import type { Listing } from "./api";

type AuthOpts = { token: string; signal?: AbortSignal };

async function authed(
  path: string,
  opts: AuthOpts & { method?: string },
): Promise<Response> {
  return fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchFavorites(opts: AuthOpts): Promise<Listing[]> {
  const res = await authed("/favorites", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Favorites failed (${res.status})`);
  return Array.isArray(data) ? data : [];
}

export async function addFavorite(
  listingId: number,
  opts: AuthOpts,
): Promise<void> {
  const res = await authed(`/favorites/${listingId}`, {
    ...opts,
    method: "POST",
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
}

export async function removeFavorite(
  listingId: number,
  opts: AuthOpts,
): Promise<void> {
  const res = await authed(`/favorites/${listingId}`, {
    ...opts,
    method: "DELETE",
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Remove failed (${res.status})`);
}

/** Best-effort: whether listing id is in the user's favorites (country-scoped list). */
export async function isFavorite(
  listingId: number,
  opts: AuthOpts,
): Promise<boolean> {
  try {
    const list = await fetchFavorites(opts);
    return list.some((l) => Number(l.id) === Number(listingId));
  } catch {
    return false;
  }
}
