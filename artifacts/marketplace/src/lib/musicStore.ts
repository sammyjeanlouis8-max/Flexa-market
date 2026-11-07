/**
 * Global singleton music store.
 * Lives outside React so the audio element and playback state survive
 * route changes — music keeps playing when the user navigates away from /music.
 */

import {
  isNativeMusicBridgeAvailable,
  nativeMusicPause,
  nativeMusicPlay,
  nativeMusicQueue,
  nativeMusicSeek,
  nativeMusicStop,
  shouldDeferToNativeMusic,
} from "@/lib/musicNativeBridge";

export interface MusicTrack {
  id: number;
  title: string;
  artist: string;
  cover_url: string | null;
  audio_url: string | null;
  [key: string]: any;
}

/** Repeat: off → all → one → off */
export type MusicRepeatMode = "off" | "all" | "one";

/** localStorage key for queue / position restore across reloads */
export const MUSIC_PLAYBACK_KEY = "flexa_music_playback_v1";

type PersistedPlayback = {
  queue: MusicTrack[];
  queueIdx: number;
  track: MusicTrack | null;
  currentTime: number;
  shuffle: boolean;
  repeat: MusicRepeatMode;
};

let _lastPersistAt = 0;
/** Debounce play API: once per track start (same id ignored until another track plays). */
let _lastRecordedPlayId: number | null = null;

function slimTrack(t: MusicTrack): MusicTrack {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    cover_url: t.cover_url ?? null,
    audio_url: t.audio_url ?? null,
  };
}

function persistPlayback(force = false): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (!force && now - _lastPersistAt < 2000) return;
  _lastPersistAt = now;
  try {
    const data: PersistedPlayback = {
      queue: _s.queue.map(slimTrack),
      queueIdx: _s.queueIdx,
      track: _s.track ? slimTrack(_s.track) : null,
      currentTime: _s.currentTime,
      shuffle: _s.shuffle,
      repeat: _s.repeat,
    };
    localStorage.setItem(MUSIC_PLAYBACK_KEY, JSON.stringify(data));
  } catch { /* quota / private mode */ }
}

function restorePlayback(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(MUSIC_PLAYBACK_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as PersistedPlayback;
    if (!data || !Array.isArray(data.queue)) return;
    const track = data.track && typeof data.track.id === "number" ? slimTrack(data.track) : null;
    const queue = data.queue.filter((t) => t && typeof t.id === "number").map(slimTrack);
    const repeat: MusicRepeatMode =
      data.repeat === "all" || data.repeat === "one" ? data.repeat : "off";
    Object.assign(_s, {
      queue,
      queueIdx: Math.max(0, Math.min(data.queueIdx ?? 0, Math.max(0, queue.length - 1))),
      track,
      currentTime: typeof data.currentTime === "number" ? data.currentTime : 0,
      shuffle: !!data.shuffle,
      repeat,
      playing: false,
      plTitle: track?.title ?? "",
      plCover: track?.cover_url ?? null,
    });
    // Restore audio element position but do NOT autoplay
    if (track?.audio_url) {
      try {
        gAudio.src = track.audio_url;
        const seekTo = typeof data.currentTime === "number" ? data.currentTime : 0;
        const applySeek = () => {
          try { gAudio.currentTime = seekTo; } catch { /* ignore */ }
        };
        if (gAudio.readyState >= 1) applySeek();
        else gAudio.addEventListener("loadedmetadata", applySeek, { once: true });
        gAudio.load();
      } catch { /* ignore */ }
    }
  } catch { /* ignore corrupt */ }
}

/**
 * Fire-and-forget play count + listening history.
 * Debounced per track id until a different track starts.
 */
export function musicRecordPlay(trackId: number): void {
  if (!Number.isFinite(trackId) || trackId <= 0) return;
  if (_lastRecordedPlayId === trackId) return;
  _lastRecordedPlayId = trackId;
  if (typeof window === "undefined") return;
  try {
    const token =
      localStorage.getItem("flexamarket_token")
      ?? sessionStorage.getItem("flexamarket_token")
      ?? "";
    void fetch(`/api/music/${trackId}/play`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({}),
    }).catch(() => {});
  } catch { /* ignore */ }
}

interface MusicStoreState {
  track: MusicTrack | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  muted: boolean;
  volume: number;
  queue: MusicTrack[];
  queueIdx: number;
  plTitle: string;
  plCover: string | null;
  plGrad: string | undefined;
  shuffle: boolean;
  repeat: MusicRepeatMode;
  playbackRate: number;
  /** Epoch ms when sleep timer should pause playback; null = inactive */
  sleepUntil: number | null;
  buffering: boolean;
  error: string | null;
}

// ── Singleton audio element (created once, lives for the app's lifetime) ────
// Appended to document.body so iOS Safari's OS audio system recognises it
// as a page-attached element and allows background / lock-screen playback.
export const gAudio: HTMLAudioElement = typeof window !== "undefined"
  ? (() => {
      const a = new Audio();
      a.preload = "metadata";
       // Do not opt in to CORS. Playback never needs canvas access, and iOS can
       // reject a signed Wasabi redirect when an anonymous CORS request is used.
      // Keep it hidden in the DOM — required for iOS background playback
      a.style.cssText = "position:absolute;width:0;height:0;opacity:0;pointer-events:none;";
      a.setAttribute("playsinline", "");        // iOS: play inline, not fullscreen
      a.setAttribute("webkit-playsinline", ""); // legacy iOS WebView compat
      document.body.appendChild(a);
      return a;
    })()
  : (null as any);

// ── State ────────────────────────────────────────────────────────────────────
const _s: MusicStoreState = {
  track: null, playing: false, currentTime: 0, duration: 0,
  muted: false, volume: 1,
  queue: [], queueIdx: 0,
  plTitle: "", plCover: null, plGrad: undefined,
  shuffle: false,
  repeat: "off",
  playbackRate: 1,
  sleepUntil: null,
  buffering: false,
  error: null,
};
const _fns = new Set<() => void>();
let _playbackIntent = false;
let _interruptedBySystem = false;
let _resumeTimers: number[] = [];
let _sleepTimerId: number | null = null;
/** Original queue order before shuffle — restored when shuffle turns off */
let _unshuffledQueue: MusicTrack[] | null = null;

export function getMusicState(): Readonly<MusicStoreState> { return _s; }

export function patchMusicState(patch: Partial<MusicStoreState>): void {
  Object.assign(_s, patch);
  _fns.forEach(f => f());
}

export function subscribeMusicState(fn: () => void): () => void {
  _fns.add(fn);
  return () => _fns.delete(fn);
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function playQueueTrack(next: MusicTrack, idx: number): void {
  // Allow re-recording when the same track is started again after another track.
  if (_lastRecordedPlayId !== next.id) _lastRecordedPlayId = null;
  patchMusicState({
    track: next,
    queueIdx: idx,
    currentTime: 0,
    duration: 0,
    error: null,
    plTitle: next.title,
    plCover: next.cover_url ?? null,
  });
  persistPlayback(true);
  if (shouldDeferToNativeMusic()) {
    // Native TrackPlayer owns audio; keep HTML element silent as UI fallback.
    try {
      gAudio.pause();
      gAudio.removeAttribute("src");
      gAudio.load();
    } catch { /* ignore */ }
    if (_s.queue.length > 1) nativeMusicQueue(_s.queue.slice(idx));
    else nativeMusicPlay(next);
    _playbackIntent = true;
    patchMusicState({ playing: true });
    syncMediaSession(next, true);
    musicRecordPlay(next.id);
    return;
  }
  gAudio.src = next.audio_url ?? "";
  gAudio.muted = _s.muted;
  gAudio.playbackRate = _s.playbackRate;
  gAudio.load();
  musicRequestPlay().catch(() => {});
  syncMediaSession(next);
  musicRecordPlay(next.id);
}

/** Play a specific index in a new queue (artist page, playlists, history). */
export function musicPlayQueue(tracks: MusicTrack[], idx = 0): void {
  if (!tracks?.length) return;
  const i = Math.max(0, Math.min(idx, tracks.length - 1));
  const next = tracks[i];
  if (!next) return;
  patchMusicState({ queue: tracks, queueIdx: i });
  playQueueTrack(next, i);
}

// ── FlexaMusic mount flag — prevents double "ended" handling ─────────────────
let _flexaMounted = false;
export function setFlexaMusicMounted(v: boolean): void { _flexaMounted = v; }

// ── MediaSession helper ───────────────────────────────────────────────────────
function syncMediaSession(t: MusicTrack, playing = true): void {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist,
    artwork: t.cover_url ? [{ src: t.cover_url, sizes: "512x512", type: "image/jpeg" }] : [],
  });
  // ← iOS REQUIRES this to be set explicitly or audio dies in background
  navigator.mediaSession.playbackState = playing ? "playing" : "paused";
}

function syncPositionState(): void {
  if (!("mediaSession" in navigator)) return;
  const dur = gAudio.duration;
  if (!isFinite(dur) || dur <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration:     dur,
      playbackRate: gAudio.playbackRate || 1,
      position:     Math.min(gAudio.currentTime, dur),
    });
  } catch { /* ignore — Safari throws if position > duration on rapid seeks */ }
}

// ── Global controls (work regardless of whether FlexaMusic is mounted) ────────
export function musicRequestPlay(): Promise<void> {
  _playbackIntent = true;
  if (shouldDeferToNativeMusic() && _s.track) {
    nativeMusicPlay(_s.track);
    try { gAudio.pause(); } catch { /* ignore */ }
    patchMusicState({ playing: true });
    syncMediaSession(_s.track, true);
    return Promise.resolve();
  }
  return gAudio.play();
}

export function musicRequestPause(): void {
  _playbackIntent = false;
  _interruptedBySystem = false;
  if (isNativeMusicBridgeAvailable()) nativeMusicPause();
  gAudio.pause();
  patchMusicState({ playing: false });
}

export function musicTogglePlay(): void {
  if (!_s.track) return;
  if (shouldDeferToNativeMusic()) {
    if (_s.playing) musicRequestPause();
    else musicRequestPlay().catch(() => {});
    return;
  }
  if (gAudio.paused) musicRequestPlay().catch(() => {});
  else musicRequestPause();
}

export function musicPlayNext(): void {
  if (_s.repeat === "one" && _s.track) {
    gAudio.currentTime = 0;
    patchMusicState({ currentTime: 0 });
    musicRequestPlay().catch(() => {});
    return;
  }
  const nextIdx = _s.queueIdx + 1;
  const next = _s.queue[nextIdx];
  if (next?.audio_url) {
    playQueueTrack(next, nextIdx);
    return;
  }
  if (_s.repeat === "all" && _s.queue.length > 0) {
    const first = _s.queue[0];
    if (first?.audio_url) playQueueTrack(first, 0);
    return;
  }
}

export function musicPlayPrev(): void {
  // If more than 3s into track, restart it; otherwise go to previous
  if (gAudio.currentTime > 3) {
    gAudio.currentTime = 0;
    patchMusicState({ currentTime: 0 });
    return;
  }
  const prevIdx = _s.queueIdx - 1;
  const prev = _s.queue[prevIdx];
  if (prev?.audio_url) {
    playQueueTrack(prev, prevIdx);
    return;
  }
  if (_s.repeat === "all" && _s.queue.length > 0) {
    const lastIdx = _s.queue.length - 1;
    const last = _s.queue[lastIdx];
    if (last?.audio_url) playQueueTrack(last, lastIdx);
  }
}

export function musicStop(): void {
  musicRequestPause();
  if (isNativeMusicBridgeAvailable()) nativeMusicStop();
  clearSleepTimer();
  patchMusicState({ track: null, playing: false, currentTime: 0, duration: 0, error: null });
}

export function musicSeek(t: number): void {
  if (shouldDeferToNativeMusic()) {
    nativeMusicSeek(t);
    patchMusicState({ currentTime: t });
    return;
  }
  gAudio.currentTime = t;
  patchMusicState({ currentTime: t });
}

export function musicToggleMute(): void {
  gAudio.muted = !gAudio.muted;
  patchMusicState({ muted: gAudio.muted });
}

export function musicToggleShuffle(): void {
  const next = !_s.shuffle;
  if (next) {
    _unshuffledQueue = [..._s.queue];
    const current = _s.track;
    const rest = _s.queue.filter(t => t.id !== current?.id);
    const shuffled = current ? [current, ...shuffleArray(rest)] : shuffleArray(_s.queue);
    patchMusicState({ shuffle: true, queue: shuffled, queueIdx: current ? 0 : _s.queueIdx });
  } else {
    const restored = _unshuffledQueue ?? _s.queue;
    _unshuffledQueue = null;
    const idx = _s.track ? Math.max(0, restored.findIndex(t => t.id === _s.track!.id)) : 0;
    patchMusicState({ shuffle: false, queue: restored, queueIdx: idx });
  }
  persistPlayback(true);
}

export function musicCycleRepeat(): MusicRepeatMode {
  const order: MusicRepeatMode[] = ["off", "all", "one"];
  const next = order[(order.indexOf(_s.repeat) + 1) % order.length];
  patchMusicState({ repeat: next });
  persistPlayback(true);
  return next;
}

export function musicSetPlaybackRate(rate: number): void {
  const clamped = Math.max(0.5, Math.min(2, rate));
  gAudio.playbackRate = clamped;
  patchMusicState({ playbackRate: clamped });
  syncPositionState();
}

export function clearSleepTimer(): void {
  if (_sleepTimerId != null) {
    window.clearTimeout(_sleepTimerId);
    _sleepTimerId = null;
  }
  if (_s.sleepUntil != null) patchMusicState({ sleepUntil: null });
}

/** Pause playback after `minutes` (0 clears). */
export function musicSetSleepTimer(minutes: number): void {
  clearSleepTimer();
  if (!minutes || minutes <= 0) return;
  const until = Date.now() + minutes * 60_000;
  patchMusicState({ sleepUntil: until });
  _sleepTimerId = window.setTimeout(() => {
    musicRequestPause();
    patchMusicState({ sleepUntil: null });
    _sleepTimerId = null;
  }, minutes * 60_000);
}

export function musicShareTrack(track?: MusicTrack | null): Promise<void> {
  const t = track ?? _s.track;
  if (!t) return Promise.resolve();
  const url = `${window.location.origin}/music?track=${t.id}`;
  const payload = { title: t.title, text: `${t.title} — ${t.artist}`, url };
  if (navigator.share) {
    return navigator.share(payload).catch(() => {
      return navigator.clipboard?.writeText(url).then(() => undefined);
    });
  }
  return navigator.clipboard?.writeText(url).then(() => undefined) ?? Promise.resolve();
}

// ── Module-level audio event listeners ───────────────────────────────────────
// These fire even when FlexaMusic is unmounted (user navigated away).
if (typeof window !== "undefined") {
  gAudio.addEventListener("timeupdate", () => {
    if (!_s.track) return;
    _s.currentTime = gAudio.currentTime;
    _fns.forEach(f => f());
    syncPositionState(); // keeps iOS lock-screen scrubber in sync
    persistPlayback(false); // throttle ~2s via MUSIC_PLAYBACK_KEY
  });
  gAudio.addEventListener("durationchange", () => {
    const d = gAudio.duration;
    if (d && isFinite(d)) { _s.duration = d; _fns.forEach(f => f()); }
  });
  gAudio.addEventListener("loadedmetadata", () => {
    const d = gAudio.duration;
    if (d && isFinite(d)) { _s.duration = d; _fns.forEach(f => f()); }
  });
  gAudio.addEventListener("play",    () => {
    _playbackIntent = true;
    _interruptedBySystem = false;
    _s.playing = true; _fns.forEach(f => f());
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    if (_s.track?.id) musicRecordPlay(_s.track.id);
  });
  gAudio.addEventListener("playing", () => {
    _playbackIntent = true;
    _interruptedBySystem = false;
    _s.playing = true; _fns.forEach(f => f());
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    syncPositionState();
    if (_s.track?.id) musicRecordPlay(_s.track.id);
  });
  gAudio.addEventListener("pause", () => {
    if (_playbackIntent && _s.track && !gAudio.ended) {
      _interruptedBySystem = true;
    }
    _s.playing = false; _fns.forEach(f => f());
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
  });
  gAudio.addEventListener("waiting", () => {
    if (!_s.track) return;
    _s.buffering = true; _fns.forEach(f => f());
  });
  gAudio.addEventListener("canplay", () => {
    if (!_s.buffering) return;
    _s.buffering = false; _fns.forEach(f => f());
  });
  gAudio.addEventListener("error", () => {
    if (!_s.track) return;
    _s.buffering = false;
    _s.error = "Playback failed. Check your connection and try again.";
    _fns.forEach(f => f());
  });
  gAudio.addEventListener("ended",   () => {
    _playbackIntent = false;
    _interruptedBySystem = false;
    _s.playing = false;
    _fns.forEach(f => f());
    // Auto-advance queue — but only when FlexaMusic is not mounted
    // (FlexaMusic handles it locally via its own "ended" listener when mounted)
    if (!_flexaMounted) {
      if (_s.repeat === "one" && _s.track) {
        gAudio.currentTime = 0;
        musicRequestPlay().catch(() => {});
      } else {
        musicPlayNext();
      }
    }
  });

  // Safari may throttle timeupdate after the Music screen unmounts. The
  // persistent mini-player reads this store directly, so it needs its own
  // reconciliation loop rather than depending on FlexaMusic being mounted.
  // Deliberately do not gate on readyState: iOS can report useful currentTime
  // while readyState is transiently zero during a range refill.
  window.setInterval(() => {
    if (!_s.track) return;
    // When TrackPlayer owns audio, HTMLAudio is intentionally paused — do not
    // reconcile playing=false from the silent element.
    if (shouldDeferToNativeMusic()) return;
    const actuallyPlaying = !gAudio.paused && !gAudio.ended;
    const nextTime = Number.isFinite(gAudio.currentTime) ? gAudio.currentTime : _s.currentTime;
    if (_s.playing === actuallyPlaying && (!actuallyPlaying || _s.currentTime === nextTime)) return;
    _s.playing = actuallyPlaying;
    if (actuallyPlaying) _s.currentTime = nextTime;
    _fns.forEach(f => f());
    if (actuallyPlaying) syncPositionState();
  }, 250);

  // Phone calls, Siri, alarms, and other OS audio interruptions pause Safari's
  // audio element without representing a user pause. Remember playback intent
  // and retry when the page becomes active again, preserving currentTime.
  const scheduleInterruptionResume = () => {
    if (!_interruptedBySystem || !_playbackIntent || !_s.track || gAudio.ended) return;
    _resumeTimers.forEach(id => window.clearTimeout(id));
    _resumeTimers = [0, 400, 1200].map(delay => window.setTimeout(() => {
      if (!_interruptedBySystem || !_playbackIntent || !_s.track || !gAudio.paused || gAudio.ended) return;
      musicRequestPlay().catch(() => {
        // Keep the interruption flag set so a later pageshow/focus event can retry.
        _interruptedBySystem = true;
      });
    }, delay));
  };

  const markBackgroundInterruption = () => {
    if (_playbackIntent && _s.track && !gAudio.ended) _interruptedBySystem = true;
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) markBackgroundInterruption();
    else scheduleInterruptionResume();
  });
  window.addEventListener("pagehide", markBackgroundInterruption);
  window.addEventListener("blur", markBackgroundInterruption);
  window.addEventListener("pageshow", scheduleInterruptionResume);
  window.addEventListener("focus", scheduleInterruptionResume);

  // MediaSession action handlers — persist globally
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play",          () => musicRequestPlay().catch(() => {}));
    navigator.mediaSession.setActionHandler("pause",         () => musicRequestPause());
    // FlexaMusic re-registers these handlers on every track/play change using
    // the same global functions, so the _flexaMounted guard is no longer needed.
    navigator.mediaSession.setActionHandler("nexttrack",     () => musicPlayNext());
    navigator.mediaSession.setActionHandler("previoustrack", () => musicPlayPrev());
    navigator.mediaSession.setActionHandler("seekto", d => {
      if (d.seekTime != null) musicSeek(d.seekTime);
    });
    // iOS shows ±10 s skip buttons on lock screen — wire them up
    navigator.mediaSession.setActionHandler("seekforward", d => {
      musicSeek(Math.min(gAudio.currentTime + (d.seekOffset ?? 10), gAudio.duration || 0));
    });
    navigator.mediaSession.setActionHandler("seekbackward", d => {
      musicSeek(Math.max(gAudio.currentTime - (d.seekOffset ?? 10), 0));
    });
  }

  // Restore last queue / position (no autoplay)
  restorePlayback();
}
