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
      a.crossOrigin = "anonymous";
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
function syncMediaSession(t: MusicTrack): void {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist,
    artwork: t.cover_url ? [{ src: t.cover_url, sizes: "512x512", type: "image/jpeg" }] : [],
  });
}

// ── Global controls (work regardless of whether FlexaMusic is mounted) ────────
export function musicTogglePlay(): void {
  if (!_s.track) return;
  if (gAudio.paused) gAudio.play().catch(() => {});
  else gAudio.pause();
}

export function musicPlayNext(): void {
  const next = _s.queue[_s.queueIdx + 1];
  if (!next?.audio_url) return;
  patchMusicState({ track: next, queueIdx: _s.queueIdx + 1, currentTime: 0, duration: 0 });
  gAudio.src = next.audio_url;
  gAudio.muted = _s.muted;
  gAudio.load();
  gAudio.play().catch(() => {});
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
  gAudio.play().catch(() => {});
  syncMediaSession(prev);
}

export function musicStop(): void {
  gAudio.pause();
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
  });
  gAudio.addEventListener("durationchange", () => {
    const d = gAudio.duration;
    if (d && isFinite(d)) { _s.duration = d; _fns.forEach(f => f()); }
  });
  gAudio.addEventListener("loadedmetadata", () => {
    const d = gAudio.duration;
    if (d && isFinite(d)) { _s.duration = d; _fns.forEach(f => f()); }
  });
  gAudio.addEventListener("play",    () => { _s.playing = true;  _fns.forEach(f => f()); });
  gAudio.addEventListener("playing", () => { _s.playing = true;  _fns.forEach(f => f()); });
  gAudio.addEventListener("pause",   () => { _s.playing = false; _fns.forEach(f => f()); });
  gAudio.addEventListener("ended",   () => {
    _s.playing = false;
    _fns.forEach(f => f());
    // Auto-advance queue — but only when FlexaMusic is not mounted
    // (FlexaMusic handles it locally via its own "ended" listener when mounted)
    if (!_flexaMounted) musicPlayNext();
  });

  // MediaSession action handlers — persist globally
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play",          () => gAudio.play().catch(() => {}));
    navigator.mediaSession.setActionHandler("pause",         () => gAudio.pause());
    navigator.mediaSession.setActionHandler("nexttrack",     () => {
      if (_flexaMounted) return; // let FlexaMusic handle it
      musicPlayNext();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      if (_flexaMounted) return;
      musicPlayPrev();
    });
    navigator.mediaSession.setActionHandler("seekto", d => {
      if (d.seekTime != null) musicSeek(d.seekTime);
    });
  }
}
