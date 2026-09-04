/**
 * Global singleton music store.
 * Lives outside React so the audio element and playback state survive
 * route changes — music keeps playing when the user navigates away from /music.
 */

export interface MusicTrack {
  id: number;
  title: string;
  artist: string;
  cover_url: string | null;
  audio_url: string | null;
  [key: string]: any;
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
};
const _fns = new Set<() => void>();
let _playbackIntent = false;
let _interruptedBySystem = false;
let _resumeTimers: number[] = [];

export function getMusicState(): Readonly<MusicStoreState> { return _s; }

export function patchMusicState(patch: Partial<MusicStoreState>): void {
  Object.assign(_s, patch);
  _fns.forEach(f => f());
}

export function subscribeMusicState(fn: () => void): () => void {
  _fns.add(fn);
  return () => _fns.delete(fn);
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
  return gAudio.play();
}

export function musicRequestPause(): void {
  _playbackIntent = false;
  _interruptedBySystem = false;
  gAudio.pause();
}

export function musicTogglePlay(): void {
  if (!_s.track) return;
  if (gAudio.paused) musicRequestPlay().catch(() => {});
  else musicRequestPause();
}

export function musicPlayNext(): void {
  const next = _s.queue[_s.queueIdx + 1];
  if (!next?.audio_url) return;
  patchMusicState({ track: next, queueIdx: _s.queueIdx + 1, currentTime: 0, duration: 0 });
  gAudio.src = next.audio_url;
  gAudio.muted = _s.muted;
  gAudio.load();
  musicRequestPlay().catch(() => {});
  syncMediaSession(next);
}

export function musicPlayPrev(): void {
  // If more than 3s into track, restart it; otherwise go to previous
  if (gAudio.currentTime > 3) {
    gAudio.currentTime = 0;
    patchMusicState({ currentTime: 0 });
    return;
  }
  const prev = _s.queue[_s.queueIdx - 1];
  if (!prev?.audio_url) return;
  patchMusicState({ track: prev, queueIdx: _s.queueIdx - 1, currentTime: 0, duration: 0 });
  gAudio.src = prev.audio_url;
  gAudio.muted = _s.muted;
  gAudio.load();
  musicRequestPlay().catch(() => {});
  syncMediaSession(prev);
}

export function musicStop(): void {
  musicRequestPause();
  patchMusicState({ track: null, playing: false, currentTime: 0, duration: 0 });
}

export function musicSeek(t: number): void {
  gAudio.currentTime = t;
  patchMusicState({ currentTime: t });
}

export function musicToggleMute(): void {
  gAudio.muted = !gAudio.muted;
  patchMusicState({ muted: gAudio.muted });
}

// ── Module-level audio event listeners ───────────────────────────────────────
// These fire even when FlexaMusic is unmounted (user navigated away).
if (typeof window !== "undefined") {
  gAudio.addEventListener("timeupdate", () => {
    if (!_s.track) return;
    _s.currentTime = gAudio.currentTime;
    _fns.forEach(f => f());
    syncPositionState(); // keeps iOS lock-screen scrubber in sync
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
  });
  gAudio.addEventListener("playing", () => {
    _playbackIntent = true;
    _interruptedBySystem = false;
    _s.playing = true; _fns.forEach(f => f());
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    syncPositionState();
  });
  gAudio.addEventListener("pause", () => {
    if (_playbackIntent && _s.track && !gAudio.ended) {
      _interruptedBySystem = true;
    }
    _s.playing = false; _fns.forEach(f => f());
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
  });
  gAudio.addEventListener("ended",   () => {
    _playbackIntent = false;
    _interruptedBySystem = false;
    _s.playing = false;
    _fns.forEach(f => f());
    // Auto-advance queue — but only when FlexaMusic is not mounted
    // (FlexaMusic handles it locally via its own "ended" listener when mounted)
    if (!_flexaMounted) musicPlayNext();
  });

  // Safari may throttle timeupdate after the Music screen unmounts. The
  // persistent mini-player reads this store directly, so it needs its own
  // reconciliation loop rather than depending on FlexaMusic being mounted.
  // Deliberately do not gate on readyState: iOS can report useful currentTime
  // while readyState is transiently zero during a range refill.
  window.setInterval(() => {
    if (!_s.track) return;
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
}
