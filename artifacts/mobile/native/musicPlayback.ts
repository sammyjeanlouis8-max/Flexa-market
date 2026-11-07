/**
 * Flexa Music — TrackPlayer setup and playback helpers.
 *
 * Gracefully no-ops when react-native-track-player is missing (Expo Go /
 * JS-only shell). Callers must treat every helper as best-effort.
 */

import type { FlexaMusicTrackPayload } from "./musicBridgeProtocol";

export type {
  FlexaMusicAction,
  FlexaMusicMessage,
  FlexaMusicNativeEvent,
  FlexaMusicTrackPayload,
} from "./musicBridgeProtocol";

type TrackPlayerModule = {
  setupPlayer: (options?: Record<string, unknown>) => Promise<void>;
  updateOptions: (options: Record<string, unknown>) => Promise<void>;
  reset: () => Promise<void>;
  add: (tracks: unknown[] | unknown) => Promise<void | number | number[]>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  getPosition: () => Promise<number>;
  getPlaybackState: () => Promise<{ state: string | number }>;
};

type CapabilityEnum = Record<string, unknown>;
type EventEnum = Record<string, unknown>;

let TrackPlayer: TrackPlayerModule | null = null;
let Capability: CapabilityEnum | null = null;
let AppKilledPlaybackBehavior: Record<string, unknown> | null = null;
let missingLogged = false;
let setupPromise: Promise<boolean> | null = null;
let setupSucceeded = false;

function logMissingOnce(reason?: unknown): void {
  if (missingLogged) return;
  missingLogged = true;
  console.warn(
    "[flexa-music] TrackPlayer native module unavailable — using WebView HTMLAudio fallback.",
    reason ?? "",
  );
}

function loadTrackPlayer(): TrackPlayerModule | null {
  if (TrackPlayer) return TrackPlayer;
  try {
    // Dynamic require so Expo Go / missing native binary never crashes import.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-track-player");
    TrackPlayer = (mod.default ?? mod) as TrackPlayerModule;
    Capability = (mod.Capability ?? null) as CapabilityEnum | null;
    AppKilledPlaybackBehavior = (mod.AppKilledPlaybackBehavior ?? null) as Record<
      string,
      unknown
    > | null;
    if (!TrackPlayer || typeof TrackPlayer.setupPlayer !== "function") {
      TrackPlayer = null;
      logMissingOnce("setupPlayer missing");
      return null;
    }
    return TrackPlayer;
  } catch (error) {
    logMissingOnce(error);
    return null;
  }
}

/** True after a successful setupPlayer() in this process. */
export function isNativeMusicReady(): boolean {
  return setupSucceeded;
}

/** Sync probe — JS module present (native may still fail at setup). */
export function isTrackPlayerModulePresent(): boolean {
  return loadTrackPlayer() != null;
}

function resolveUrl(track?: FlexaMusicTrackPayload, url?: string): string | null {
  const raw =
    (typeof url === "string" && url) ||
    (typeof track?.url === "string" && track.url) ||
    (typeof track?.audio_url === "string" && track.audio_url) ||
    "";
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toRntpTrack(track: FlexaMusicTrackPayload, urlOverride?: string) {
  const url = resolveUrl(track, urlOverride);
  if (!url) return null;
  const id = track.id != null ? String(track.id) : url;
  const artwork =
    (typeof track.artwork === "string" && track.artwork) ||
    (typeof track.cover_url === "string" && track.cover_url) ||
    undefined;
  return {
    id,
    url,
    title: typeof track.title === "string" && track.title ? track.title : "Flexa Music",
    artist: typeof track.artist === "string" && track.artist ? track.artist : "Unknown",
    artwork,
  };
}

/**
 * Idempotent TrackPlayer bootstrap. Safe to call from App mount.
 * Returns false when the native module is missing or setup fails.
 */
export async function setupMusicPlayer(): Promise<boolean> {
  if (setupSucceeded) return true;
  if (setupPromise) return setupPromise;

  setupPromise = (async () => {
    const player = loadTrackPlayer();
    if (!player) return false;
    try {
      await player.setupPlayer({
        autoHandleInterruptions: true,
      });
      const caps = Capability
        ? [
            Capability.Play,
            Capability.Pause,
            Capability.Stop,
            Capability.SeekTo,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ].filter(Boolean)
        : [];
      const androidOpts: Record<string, unknown> = {};
      if (AppKilledPlaybackBehavior?.ContinuePlayback != null) {
        androidOpts.appKilledPlaybackBehavior =
          AppKilledPlaybackBehavior.ContinuePlayback;
      }
      await player.updateOptions({
        capabilities: caps,
        compactCapabilities: Capability
          ? [Capability.Play, Capability.Pause, Capability.SkipToNext].filter(Boolean)
          : [],
        android: androidOpts,
        progressUpdateEventInterval: 1,
      });
      setupSucceeded = true;
      return true;
    } catch (error) {
      // Already-initialized is fine across Fast Refresh.
      const message = error instanceof Error ? error.message : String(error);
      if (/already been initialized|already initialized/i.test(message)) {
        setupSucceeded = true;
        return true;
      }
      logMissingOnce(error);
      setupSucceeded = false;
      return false;
    }
  })();

  try {
    return await setupPromise;
  } finally {
    if (!setupSucceeded) setupPromise = null;
  }
}

export async function musicLoad(track: FlexaMusicTrackPayload, url?: string): Promise<boolean> {
  const player = loadTrackPlayer();
  if (!player) return false;
  const ready = await setupMusicPlayer();
  if (!ready) return false;
  const mapped = toRntpTrack(track, url);
  if (!mapped) return false;
  try {
    await player.reset();
    await player.add(mapped);
    return true;
  } catch (error) {
    logMissingOnce(error);
    return false;
  }
}

export async function musicQueue(tracks: FlexaMusicTrackPayload[]): Promise<boolean> {
  const player = loadTrackPlayer();
  if (!player) return false;
  const ready = await setupMusicPlayer();
  if (!ready) return false;
  const mapped = tracks
    .map((t) => toRntpTrack(t))
    .filter((t): t is NonNullable<typeof t> => t != null);
  if (mapped.length === 0) return false;
  try {
    await player.reset();
    await player.add(mapped);
    return true;
  } catch (error) {
    logMissingOnce(error);
    return false;
  }
}

export async function musicPlay(): Promise<boolean> {
  const player = loadTrackPlayer();
  if (!player) return false;
  const ready = await setupMusicPlayer();
  if (!ready) return false;
  try {
    await player.play();
    return true;
  } catch (error) {
    logMissingOnce(error);
    return false;
  }
}

export async function musicPause(): Promise<boolean> {
  const player = loadTrackPlayer();
  if (!player || !setupSucceeded) return false;
  try {
    await player.pause();
    return true;
  } catch (error) {
    logMissingOnce(error);
    return false;
  }
}

export async function musicStop(): Promise<boolean> {
  const player = loadTrackPlayer();
  if (!player || !setupSucceeded) return false;
  try {
    await player.stop();
    await player.reset();
    return true;
  } catch (error) {
    logMissingOnce(error);
    return false;
  }
}

export async function musicSeek(position: number): Promise<boolean> {
  const player = loadTrackPlayer();
  if (!player || !setupSucceeded) return false;
  if (!Number.isFinite(position) || position < 0) return false;
  try {
    await player.seekTo(position);
    return true;
  } catch (error) {
    logMissingOnce(error);
    return false;
  }
}

/** Re-export Event enum lazily for the playback service. */
export function getTrackPlayerEventEnum(): EventEnum | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-track-player");
    return (mod.Event ?? null) as EventEnum | null;
  } catch {
    return null;
  }
}

export function getTrackPlayerOrNull(): TrackPlayerModule | null {
  return loadTrackPlayer();
}
