/**
 * Flexa Music catalog + stream URL helpers.
 * Digital purchases remain platform-gated (Android Play / iOS IAP).
 */
import { Platform } from "react-native";
import { getApiBase } from "./api";

export type MusicTrack = {
  id: number;
  title: string;
  artist?: string | null;
  genre?: string | null;
  coverUrl?: string | null;
  durationSec?: number | null;
  isFeatured?: boolean;
  price?: number | null;
  [key: string]: unknown;
};

type FetchOpts = { token?: string | null; signal?: AbortSignal };

function headers(token?: string | null): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export function isMusicPurchaseBlockedOnPlatform(): boolean {
  return Platform.OS === "android";
}

export async function fetchMusicCatalog(
  params: {
    genre?: string;
    artist?: string;
    search?: string;
    featured?: boolean;
    limit?: number;
    offset?: number;
  } = {},
  opts: FetchOpts = {},
): Promise<MusicTrack[]> {
  const q = new URLSearchParams();
  if (params.genre) q.set("genre", params.genre);
  if (params.artist) q.set("artist", params.artist);
  if (params.search) q.set("search", params.search);
  if (params.featured) q.set("featured", "1");
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  const res = await fetch(`${getApiBase()}/music?${q}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`Music catalog failed (${res.status})`);
  const data = await res.json();
  return Array.isArray(data.tracks) ? data.tracks : Array.isArray(data) ? data : [];
}

export async function fetchMusicTrack(
  id: number,
  opts: FetchOpts = {},
): Promise<MusicTrack> {
  const res = await fetch(`${getApiBase()}/music/${id}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`Track failed (${res.status})`);
  const data = await res.json();
  return (data.track ?? data) as MusicTrack;
}

export async function fetchMusicStreamUrl(
  trackId: number,
  opts: FetchOpts = {},
): Promise<string> {
  const res = await fetch(`${getApiBase()}/music/stream-url/${trackId}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`Stream URL failed (${res.status})`);
  const data = await res.json();
  if (!data?.url) throw new Error("No stream URL");
  return String(data.url);
}

export async function fetchPurchasedMusicIds(opts: {
  token: string;
  signal?: AbortSignal;
}): Promise<number[]> {
  const res = await fetch(`${getApiBase()}/music/purchased`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`Purchased music failed (${res.status})`);
  const data = await res.json();
  return Array.isArray(data.purchasedIds) ? data.purchasedIds : [];
}
