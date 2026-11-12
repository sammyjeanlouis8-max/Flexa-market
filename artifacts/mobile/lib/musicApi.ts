/**
 * Flexa Music — browse, stream, like, comment, upload (commerce disabled on Android).
 */
import { getApiBase } from "./api";

type AuthOpts = { token?: string | null };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function headers(opts: AuthOpts & { json?: boolean } = {}): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (opts.token) h.Authorization = `Bearer ${opts.token}`;
  if (opts.json) h["Content-Type"] = "application/json";
  return h;
}

export type MusicTrack = {
  id: number;
  title: string;
  artist?: string | null;
  album?: string | null;
  genre?: string | null;
  cover_url?: string | null;
  audio_url?: string | null;
  duration_seconds?: number | null;
  play_count?: number;
  is_featured?: boolean;
  artist_user_id?: number | null;
  lyrics?: string | null;
  monetization_type?: string | null;
  price_usd?: number | null;
  [key: string]: unknown;
};

export type MusicComment = {
  id: number;
  content: string;
  created_at?: string;
  user_id?: number;
  user_name?: string;
  user_avatar?: string | null;
};

export async function fetchMusicTracks(
  opts: AuthOpts & { search?: string; genre?: string; featured?: boolean; limit?: number } = {},
): Promise<MusicTrack[]> {
  const q = new URLSearchParams();
  if (opts.search) q.set("search", opts.search);
  if (opts.genre) q.set("genre", opts.genre);
  if (opts.featured) q.set("featured", "1");
  q.set("limit", String(opts.limit ?? 50));
  const res = await fetch(`${getApiBase()}/music?${q}`, { headers: headers(opts) });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Music list failed (${res.status})`);
  return Array.isArray(data.tracks) ? data.tracks : [];
}

export async function fetchMusicTrack(id: number, opts: AuthOpts = {}): Promise<MusicTrack> {
  const res = await fetch(`${getApiBase()}/music/${id}`, { headers: headers(opts) });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Track failed (${res.status})`);
  return (data.track ?? data) as MusicTrack;
}

export async function fetchMusicStreamUrl(
  trackId: number,
  opts: AuthOpts = {},
): Promise<{ url: string; key?: string }> {
  const res = await fetch(`${getApiBase()}/music/stream-url/${trackId}`, {
    headers: headers(opts),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Stream URL failed (${res.status})`);
  let url = String(data.url ?? "");
  if (!url && data.key) url = `${getApiBase()}/music/stream/${data.key}`;
  if (!url) throw new Error("No stream URL");
  if (url.startsWith("/")) url = `https://flexamarket.com${url}`;
  return { url, key: data.key };
}

/** Absolute playable URL preferring signed stream-url, falling back to audio_url. */
export async function resolveMusicPlayUrl(
  track: MusicTrack,
  opts: AuthOpts = {},
): Promise<string> {
  try {
    const signed = await fetchMusicStreamUrl(track.id, opts);
    return signed.url;
  } catch {
    let url = String(track.audio_url ?? "");
    if (url.startsWith("/")) url = `https://flexamarket.com${url}`;
    if (!url) throw new Error("Track has no playable URL");
    return url;
  }
}

export async function fetchMusicLikes(
  id: number,
  opts: AuthOpts = {},
): Promise<{ count: number; liked: boolean }> {
  const res = await fetch(`${getApiBase()}/music/${id}/likes`, { headers: headers(opts) });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Likes failed (${res.status})`);
  return { count: Number(data.count ?? 0), liked: Boolean(data.liked) };
}

export async function toggleMusicLike(
  id: number,
  opts: { token: string },
): Promise<{ liked: boolean; count: number }> {
  const res = await fetch(`${getApiBase()}/music/${id}/like`, {
    method: "POST",
    headers: headers({ ...opts, json: true }),
    body: "{}",
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Like failed (${res.status})`);
  return { liked: Boolean(data.liked), count: Number(data.count ?? 0) };
}

export async function fetchMusicComments(id: number): Promise<MusicComment[]> {
  const res = await fetch(`${getApiBase()}/music/${id}/comments`, {
    headers: { Accept: "application/json" },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Comments failed (${res.status})`);
  return Array.isArray(data.comments) ? data.comments : [];
}

export async function postMusicComment(
  id: number,
  content: string,
  opts: { token: string },
): Promise<MusicComment> {
  const res = await fetch(`${getApiBase()}/music/${id}/comments`, {
    method: "POST",
    headers: headers({ ...opts, json: true }),
    body: JSON.stringify({ content: content.trim().slice(0, 500) }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Comment failed (${res.status})`);
  return data as MusicComment;
}

export type ArtistPlan = {
  canUpload: boolean;
  songCount: number;
  freeSongLimit?: number;
  [key: string]: unknown;
};

export async function fetchMusicArtistPlan(opts: { token: string }): Promise<ArtistPlan> {
  const res = await fetch(`${getApiBase()}/music/artist/plan`, { headers: headers(opts) });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Artist plan failed (${res.status})`);
  return data as ArtistPlan;
}

export async function requestMusicUploadSignature(
  input: {
    audio: { size: number; contentType: string; name?: string };
    cover?: { size: number; contentType: string; name?: string } | null;
  },
  opts: { token: string },
): Promise<{ audio: { uploadUrl: string }; cover?: { uploadUrl: string } | null }> {
  const res = await fetch(`${getApiBase()}/music/upload-signature`, {
    method: "POST",
    headers: headers({ ...opts, json: true }),
    body: JSON.stringify(input),
  });
  const data = await readJson(res);
  if (!res.ok) {
    const err = new Error(data.error || `Upload signature failed (${res.status})`) as Error & {
      code?: string;
      count?: number;
    };
    err.code = data.error;
    err.count = data.count;
    throw err;
  }
  return data;
}

/** Absolute put-proxy URL from a relative or absolute uploadUrl. */
export function absoluteUploadUrl(uploadUrl: string): string {
  if (uploadUrl.startsWith("http")) return uploadUrl;
  return `${getApiBase().replace(/\/api$/, "")}${uploadUrl.startsWith("/") ? "" : "/"}${uploadUrl}`;
}

/** Extract Wasabi storage key from put-proxy response URL. */
export function extractStorageKeyFromProxyUrl(proxyUrl: string): string {
  try {
    const u = new URL(proxyUrl, "https://flexamarket.com");
    const k = u.searchParams.get("key");
    if (k) return k;
  } catch {
    /* fall through */
  }
  throw new Error("Unexpected upload response URL");
}

/**
 * PUT local file bytes to a music put-proxy URL with progress (0–100).
 * Returns the Wasabi storage key.
 */
export async function putMusicFile(
  localUri: string,
  uploadUrl: string,
  opts: {
    token: string;
    contentType: string;
    expectedBytes: number;
    onProgress?: (percent: number) => void;
  },
): Promise<string> {
  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
  if (!blob.size) throw new Error("Could not read file");
  if (blob.size !== opts.expectedBytes) {
    throw new Error("File size changed after signature — pick the file again");
  }
  const absolute = absoluteUploadUrl(uploadUrl);
  const putData = await new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", absolute);
    xhr.setRequestHeader("Content-Type", opts.contentType);
    xhr.setRequestHeader("Authorization", `Bearer ${opts.token}`);
    xhr.setRequestHeader("Content-Length", String(blob.size));
    xhr.responseType = "json";
    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable || !opts.onProgress) return;
      opts.onProgress(Math.round((evt.loaded / evt.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response ?? {});
      else {
        const err =
          (xhr.response && (xhr.response.error || xhr.response.message)) ||
          `Upload failed (${xhr.status})`;
        reject(new Error(String(err)));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(blob);
  });
  const url = String(putData?.url || "");
  if (!url) throw new Error("Upload succeeded but no URL returned");
  return extractStorageKeyFromProxyUrl(url);
}

export async function registerMusicTrack(
  input: {
    title: string;
    artist: string;
    album?: string;
    genre?: string;
    storageKey: string;
    coverStorageKey?: string;
    duration_seconds?: number;
    lyrics?: string;
  },
  opts: { token: string },
): Promise<MusicTrack> {
  const res = await fetch(`${getApiBase()}/music/register`, {
    method: "POST",
    headers: headers({ ...opts, json: true }),
    body: JSON.stringify(input),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Register failed (${res.status})`);
  return (data.track ?? data) as MusicTrack;
}

export async function followUser(
  userId: number,
  opts: { token: string },
): Promise<void> {
  const res = await fetch(`${getApiBase()}/users/${userId}/follow`, {
    method: "POST",
    headers: headers({ ...opts, json: true }),
    body: "{}",
  });
  if (res.ok || res.status === 204) return;
  const data = await readJson(res);
  throw new Error(data.error || `Follow failed (${res.status})`);
}

export async function unfollowUser(
  userId: number,
  opts: { token: string },
): Promise<void> {
  const res = await fetch(`${getApiBase()}/users/${userId}/follow`, {
    method: "DELETE",
    headers: headers(opts),
  });
  if (res.ok || res.status === 204) return;
  const data = await readJson(res);
  throw new Error(data.error || `Unfollow failed (${res.status})`);
}

/** Absolute cover image URL helper. */
export function musicCoverUri(track: MusicTrack): string | null {
  const u = track.cover_url;
  if (!u) return null;
  if (u.startsWith("/")) return `https://flexamarket.com${u}`;
  return u;
}
