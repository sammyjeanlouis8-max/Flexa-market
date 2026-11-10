/**
 * Flexa TV — broadcast, schedule, programs, series, movies (verified APIs).
 */
import { getApiBase } from "./api";

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export type TvBroadcast = {
  state?: string;
  programId?: number | null;
  programTitle?: string | null;
  videoUrl?: string | null;
  videoKey?: string | null;
  viewerCount?: number;
  startedAt?: string | null;
};

export type TvProgram = {
  id: number;
  title: string;
  description?: string | null;
  type?: string | null;
  videoUrl?: string | null;
  videoKey?: string | null;
  thumbnailUrl?: string | null;
  durationMinutes?: number | null;
  scheduledAt?: string | null;
  endsAt?: string | null;
  seriesId?: number | null;
  episodeNumber?: number | null;
  seasonNumber?: number | null;
  isFeatured?: boolean;
  viewCount?: number;
  seriesTitle?: string | null;
};

export type TvSeries = {
  id: number;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  [key: string]: unknown;
};

export type TvMovie = {
  imdbCode?: string;
  title: string;
  description?: string | null;
  year?: number;
  durationMinutes?: number;
  rating?: number;
  genres?: string[];
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
};

/** Resolve a playable URL for TV content (Wasabi object or direct/embed URL). */
export function resolveTvPlayUrl(item: {
  videoUrl?: string | null;
  videoKey?: string | null;
}): string | null {
  if (item.videoKey) {
    const key = String(item.videoKey).replace(/^\//, "");
    return `${getApiBase()}/storage/objects/${key}`;
  }
  const url = item.videoUrl?.trim();
  if (!url) return null;
  if (url.startsWith("/")) return `https://flexamarket.com${url}`;
  return url;
}

export async function fetchTvBroadcast(): Promise<TvBroadcast | null> {
  const res = await fetch(`${getApiBase()}/tv/broadcast`, { headers: { Accept: "application/json" } });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Broadcast failed (${res.status})`);
  return (data.broadcast ?? data) as TvBroadcast;
}

export async function fetchTvNowPlaying(): Promise<TvBroadcast | null> {
  const res = await fetch(`${getApiBase()}/tv/now-playing`, { headers: { Accept: "application/json" } });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Now playing failed (${res.status})`);
  return (data.broadcast ?? data.nowPlaying ?? data) as TvBroadcast;
}

export async function postTvHeartbeat(viewerId: string): Promise<{ state?: string; viewerCount?: number }> {
  const res = await fetch(`${getApiBase()}/tv/broadcast/heartbeat`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ viewerId }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Heartbeat failed (${res.status})`);
  return data;
}

export async function fetchTvSchedule(): Promise<TvProgram[]> {
  const res = await fetch(`${getApiBase()}/tv/schedule`, { headers: { Accept: "application/json" } });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Schedule failed (${res.status})`);
  return Array.isArray(data.programs) ? data.programs : Array.isArray(data) ? data : [];
}

export async function fetchTvPrograms(): Promise<TvProgram[]> {
  const res = await fetch(`${getApiBase()}/tv/programs`, { headers: { Accept: "application/json" } });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Programs failed (${res.status})`);
  return Array.isArray(data.programs) ? data.programs : Array.isArray(data) ? data : [];
}

export async function fetchTvSeries(): Promise<TvSeries[]> {
  const res = await fetch(`${getApiBase()}/tv/series`, { headers: { Accept: "application/json" } });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Series failed (${res.status})`);
  return Array.isArray(data.series) ? data.series : Array.isArray(data) ? data : [];
}

export async function fetchTvMovies(page = 1): Promise<TvMovie[]> {
  const res = await fetch(`${getApiBase()}/tv/movies?page=${page}`, {
    headers: { Accept: "application/json" },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Movies failed (${res.status})`);
  return Array.isArray(data.results) ? data.results : [];
}

export async function recordTvProgramView(id: number): Promise<void> {
  await fetch(`${getApiBase()}/tv/programs/${id}/view`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => {});
}
