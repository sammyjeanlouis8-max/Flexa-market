/**
 * Web ↔ React Native WebView music bridge.
 *
 * When the Flexa Market native shell advertises `window.__flexaNativeMusic`,
 * playback commands are posted to TrackPlayer. HTMLAudioElement remains the
 * fallback for browsers and Expo Go (flag absent / postMessage unavailable).
 */

import type { MusicTrack } from "@/lib/musicStore";

export type NativeMusicAction = "play" | "pause" | "seek" | "load" | "queue" | "stop";

export interface NativeMusicTrackPayload {
  id?: number | string;
  title?: string;
  artist?: string;
  url?: string;
  audio_url?: string | null;
  cover_url?: string | null;
}

interface NativeMusicMessage {
  type: "flexa-music";
  action: NativeMusicAction;
  track?: NativeMusicTrackPayload;
  position?: number;
  queue?: NativeMusicTrackPayload[];
  url?: string;
}

type RNWebView = { postMessage: (message: string) => void };

function getReactNativeWebView(): RNWebView | null {
  if (typeof window === "undefined") return null;
  const wv = (window as Window & { ReactNativeWebView?: RNWebView }).ReactNativeWebView;
  return wv && typeof wv.postMessage === "function" ? wv : null;
}

/** True when the native shell has advertised TrackPlayer capability. */
export function isNativeMusicBridgeAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const flagged = (window as Window & { __flexaNativeMusic?: boolean }).__flexaNativeMusic === true;
  return flagged && getReactNativeWebView() != null;
}

/** Whether the SPA should let native own audio (pause HTML element). */
export function shouldDeferToNativeMusic(): boolean {
  return isNativeMusicBridgeAvailable();
}

function toPayload(track: MusicTrack | NativeMusicTrackPayload): NativeMusicTrackPayload {
  return {
    id: track.id,
    title: typeof track.title === "string" ? track.title : undefined,
    artist: typeof track.artist === "string" ? track.artist : undefined,
    audio_url: track.audio_url ?? undefined,
    cover_url: track.cover_url ?? null,
    url: (track as NativeMusicTrackPayload).url ?? track.audio_url ?? undefined,
  };
}

/**
 * Resolve a playable URL for native.
 * Prefers same-origin stream helper when only an id is known; otherwise audio_url.
 */
export function resolveNativeStreamUrl(track: MusicTrack | NativeMusicTrackPayload): string | null {
  const direct =
    (typeof (track as NativeMusicTrackPayload).url === "string" &&
      (track as NativeMusicTrackPayload).url) ||
    (typeof track.audio_url === "string" && track.audio_url) ||
    "";
  if (direct) {
    // Prefer same-origin absolute URLs for native HTTP clients.
    if (direct.startsWith("/") && typeof window !== "undefined") {
      return `${window.location.origin}${direct}`;
    }
    return direct;
  }
  if (track.id != null && typeof window !== "undefined") {
    return `${window.location.origin}/api/music/stream-url?id=${encodeURIComponent(String(track.id))}`;
  }
  return null;
}

export function postNativeMusicMessage(message: NativeMusicMessage): boolean {
  const wv = getReactNativeWebView();
  if (!wv || (window as Window & { __flexaNativeMusic?: boolean }).__flexaNativeMusic !== true) {
    return false;
  }
  try {
    wv.postMessage(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

export function nativeMusicLoad(track: MusicTrack, url?: string): boolean {
  const stream = url ?? resolveNativeStreamUrl(track);
  if (!stream) return false;
  return postNativeMusicMessage({
    type: "flexa-music",
    action: "load",
    track: toPayload(track),
    url: stream,
  });
}

export function nativeMusicPlay(track?: MusicTrack | null, url?: string): boolean {
  if (track) {
    const stream = url ?? resolveNativeStreamUrl(track);
    return postNativeMusicMessage({
      type: "flexa-music",
      action: "play",
      track: toPayload(track),
      url: stream ?? undefined,
    });
  }
  return postNativeMusicMessage({ type: "flexa-music", action: "play" });
}

export function nativeMusicPause(): boolean {
  return postNativeMusicMessage({ type: "flexa-music", action: "pause" });
}

export function nativeMusicStop(): boolean {
  return postNativeMusicMessage({ type: "flexa-music", action: "stop" });
}

export function nativeMusicSeek(position: number): boolean {
  if (!Number.isFinite(position) || position < 0) return false;
  return postNativeMusicMessage({
    type: "flexa-music",
    action: "seek",
    position,
  });
}

export function nativeMusicQueue(tracks: MusicTrack[]): boolean {
  const queue = tracks
    .map((t) => {
      const payload = toPayload(t);
      const url = resolveNativeStreamUrl(t);
      return url ? { ...payload, url } : null;
    })
    .filter((t): t is NativeMusicTrackPayload => t != null);
  if (queue.length === 0) return false;
  return postNativeMusicMessage({
    type: "flexa-music",
    action: "queue",
    queue,
  });
}
