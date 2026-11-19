/**
 * Flexa Music API — same ingress as marketplace (DigitalOcean / flexamarket.com/api).
 */
import { getApiBase } from "./api";

export type MusicTrack = {
  id: number;
  title: string;
  artist: string;
  album?: string | null;
  genre?: string | null;
  cover_url?: string | null;
  audio_url?: string | null;
  duration_seconds?: number | null;
  type?: string | null;
  is_featured?: boolean;
  play_count?: number;
  created_at?: string;
  lyrics?: string | null;
  monetization_type?: string | null;
  price_usd?: number | string | null;
};

export type MusicPlaylist = {
  id: number;
  title: string;
  description?: string | null;
  cover_url?: string | null;
  track_count?: number;
  is_featured?: boolean;
};

type FetchOpts = { token?: string | null; signal?: AbortSignal };

async function musicFetch(path: string, opts: FetchOpts & { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  return res;
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/** Origin without trailing /api — for relative /api/music/stream paths */
export function musicMediaOrigin(): string {
  return getApiBase().replace(/\/api\/?$/, "");
}

export function absoluteMusicUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
  if (pathOrUrl.startsWith("/api/")) return `${musicMediaOrigin()}${pathOrUrl}`;
  if (pathOrUrl.startsWith("/")) return `${getApiBase()}${pathOrUrl}`;
  return pathOrUrl;
}

export async function fetchMusicCatalog(
  params: { search?: string; featured?: boolean; limit?: number; offset?: number; genre?: string },
  opts: FetchOpts = {},
): Promise<MusicTrack[]> {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.featured) q.set("featured", "1");
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.genre) q.set("genre", params.genre);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await musicFetch(`/music${suffix}`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Music list failed (${res.status})`);
  return Array.isArray(data.tracks) ? data.tracks : [];
}

export async function fetchMusicTrack(
  id: number | string,
  opts: FetchOpts = {},
): Promise<MusicTrack> {
  const res = await musicFetch(`/music/${id}`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Track failed (${res.status})`);
  return data.track as MusicTrack;
}

export async function fetchMusicStreamUrl(
  trackId: number | string,
  opts: FetchOpts = {},
): Promise<string> {
  const res = await musicFetch(`/music/stream-url/${trackId}`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Stream URL failed (${res.status})`);
  const url = data.url as string | undefined;
  if (!url) throw new Error("No stream URL");
  return absoluteMusicUrl(url) ?? url;
}

export async function fetchPlaylists(opts: FetchOpts = {}): Promise<MusicPlaylist[]> {
  const res = await musicFetch("/music/playlists", opts);
  if (res.status === 404) return [];
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Playlists failed (${res.status})`);
  return Array.isArray(data.playlists) ? data.playlists : [];
}

export async function fetchPlaylist(
  id: number | string,
  opts: FetchOpts = {},
): Promise<{ playlist: MusicPlaylist; tracks: MusicTrack[] }> {
  const res = await musicFetch(`/music/playlists/${id}`, opts);
  if (res.status === 404) {
    return {
      playlist: { id: Number(id), title: "Playlist", track_count: 0 },
      tracks: [],
    };
  }
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Playlist failed (${res.status})`);
  return {
    playlist: data.playlist ?? { id: Number(id), title: "Playlist" },
    tracks: Array.isArray(data.tracks) ? data.tracks : [],
  };
}

export type TrackLikes = { count: number; liked: boolean };

export async function fetchTrackLikes(
  trackId: number | string,
  opts: FetchOpts = {},
): Promise<TrackLikes> {
  const res = await musicFetch(`/music/${trackId}/likes`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Likes failed (${res.status})`);
  return { count: Number(data.count) || 0, liked: Boolean(data.liked) };
}

export async function toggleTrackLike(
  trackId: number | string,
  opts: FetchOpts & { token: string },
): Promise<TrackLikes> {
  const res = await musicFetch(`/music/${trackId}/like`, { ...opts, method: "POST" });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Like failed (${res.status})`);
  return { count: Number(data.count) || 0, liked: Boolean(data.liked) };
}

export type UploadSignatureResponse = {
  backend: string;
  audio: { uploadUrl: string };
  cover: { uploadUrl: string } | null;
};

export async function requestMusicUploadSignature(
  body: {
    audio: { size: number; contentType: string; name?: string };
    cover?: { size: number; contentType: string; name?: string } | null;
  },
  opts: FetchOpts & { token: string },
): Promise<UploadSignatureResponse> {
  const res = await musicFetch("/music/upload-signature", {
    ...opts,
    method: "POST",
    body,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Upload signature failed (${res.status})`);
  return data as UploadSignatureResponse;
}

export async function registerMusicTrack(
  body: Record<string, unknown>,
  opts: FetchOpts & { token: string },
): Promise<MusicTrack> {
  const res = await musicFetch("/music/register", { ...opts, method: "POST", body });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Register failed (${res.status})`);
  return (data.track ?? data) as MusicTrack;
}

export function proxyUploadUrl(relative: string): string {
  if (relative.startsWith("http")) return relative;
  return `${musicMediaOrigin()}${relative.startsWith("/") ? relative : `/${relative}`}`;
}

/** Purchase a priced track with FM Wallet (Android digital purchases unblocked). */
export async function buyMusicTrackWithWallet(
  trackId: number | string,
  opts: FetchOpts & { token: string },
): Promise<void> {
  const res = await musicFetch(`/music/${trackId}/buy/wallet`, {
    ...opts,
    method: "POST",
    body: {},
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Purchase failed (${res.status})`);
}