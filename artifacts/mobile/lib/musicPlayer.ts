/**
 * Lightweight Expo AV queue player for Flexa Music.
 */
import { Audio, AVPlaybackStatus, AVPlaybackStatusSuccess } from "expo-av";
import {
  absoluteMusicUrl,
  fetchMusicStreamUrl,
  type MusicTrack,
} from "./musicApi";
import { recordNaturalSongCompletion, resetAdCounter } from "./musicAdBreak";

export type PlayerState = {
  queue: MusicTrack[];
  index: number;
  track: MusicTrack | null;
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  loading: boolean;
  adBreakActive: boolean;
};

export type MusicAdBreakRequest = {
  intendsPlay: boolean;
  continueQueue: () => Promise<void>;
};

type Listener = (state: PlayerState) => void;
type AdBreakListener = (active: boolean) => void;
type AdBreakHandler = (req: MusicAdBreakRequest) => Promise<void>;

let sound: Audio.Sound | null = null;
let queue: MusicTrack[] = [];
let index = 0;
let shuffle = false;
let repeat: PlayerState["repeat"] = "off";
let isPlaying = false;
let positionMillis = 0;
let durationMillis = 0;
let loading = false;
let adBreakActive = false;
const listeners = new Set<Listener>();
const adBreakListeners = new Set<AdBreakListener>();
let audioModeReady = false;
let adBreakHandler: AdBreakHandler | null = null;

function snapshot(): PlayerState {
  return {
    queue: [...queue],
    index,
    track: queue[index] ?? null,
    isPlaying,
    positionMillis,
    durationMillis,
    shuffle,
    repeat,
    loading,
    adBreakActive,
  };
}

function emit() {
  const s = snapshot();
  for (const l of listeners) l(s);
}

function setAdBreakActive(on: boolean) {
  if (adBreakActive === on) return;
  adBreakActive = on;
  for (const l of adBreakListeners) l(on);
  emit();
}

export function subscribeMusicPlayer(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function subscribeMusicAdBreak(listener: AdBreakListener): () => void {
  adBreakListeners.add(listener);
  listener(adBreakActive);
  return () => adBreakListeners.delete(listener);
}

export function getPlayerState(): PlayerState {
  return snapshot();
}

export function setMusicAdBreakHandler(handler: AdBreakHandler | null) {
  adBreakHandler = handler;
}

async function ensureAudioMode() {
  if (audioModeReady) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    audioModeReady = true;
  } catch {
    /* non-fatal on web/simulator */
  }
}

async function unload() {
  if (sound) {
    try {
      await sound.unloadAsync();
    } catch {
      /* */
    }
    sound = null;
  }
}

function queueHasNextAfterCurrent(): boolean {
  if (!queue.length) return false;
  const nextIndex = index + 1;
  if (nextIndex < queue.length) return true;
  return repeat === "all" && queue.length > 0;
}

async function continueAfterAdBreak() {
  if (!queueHasNextAfterCurrent()) return;
  await nextInternal(true);
}

async function handleNaturalTrackEnd() {
  const intendsPlay = isPlaying;
  const hasNext = queueHasNextAfterCurrent();

  // Always count natural completions — including the final song in a queue.
  // Skips / next() never reach here (only didJustFinish).
  let shouldBreak = false;
  try {
    shouldBreak = await recordNaturalSongCompletion();
  } catch {
    shouldBreak = false;
  }

  // Queue ending into silence — never burn an ad; leave the counter as-is.
  if (!hasNext) return;

  // Avoid back-to-back breaks if a prior ad is still winding down.
  if (adBreakActive) {
    await nextInternal(intendsPlay);
    return;
  }

  if (shouldBreak && adBreakHandler) {
    // Reset only when we attempt a break (fail-open still clears the slot —
    // do not stack missed ads).
    await resetAdCounter();
    await pause();
    setAdBreakActive(true);
    try {
      await adBreakHandler({
        intendsPlay,
        continueQueue: continueAfterAdBreak,
      });
    } finally {
      setAdBreakActive(false);
    }
    return;
  }
  await nextInternal(intendsPlay);
}

function onStatusUpdate(status: AVPlaybackStatus) {
  if (!status.isLoaded) return;
  const st = status as AVPlaybackStatusSuccess;
  positionMillis = st.positionMillis ?? 0;
  durationMillis = st.durationMillis ?? 0;
  isPlaying = st.isPlaying;
  emit();
  if (adBreakActive) return;
  if (st.didJustFinish && !st.isLooping) {
    void handleNaturalTrackEnd();
  }
}

async function resolvePlayableUrl(track: MusicTrack): Promise<string> {
  const direct = absoluteMusicUrl(track.audio_url);
  if (direct) return direct;
  return fetchMusicStreamUrl(track.id);
}

async function loadIndex(nextIndex: number, autoplay = true) {
  if (!queue.length) return;
  const i = Math.max(0, Math.min(nextIndex, queue.length - 1));
  index = i;
  const track = queue[i];
  loading = true;
  emit();
  await unload();
  await ensureAudioMode();
  try {
    const uri = await resolvePlayableUrl(track);
    const { sound: s } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: autoplay, progressUpdateIntervalMillis: 500 },
    );
    sound = s;
    sound.setOnPlaybackStatusUpdate(onStatusUpdate);
    isPlaying = autoplay;
  } catch {
    isPlaying = false;
  } finally {
    loading = false;
    emit();
  }
}

export async function setQueue(tracks: MusicTrack[], startAt = 0) {
  queue = tracks;
  if (!tracks.length) {
    await unload();
    index = 0;
    isPlaying = false;
    positionMillis = 0;
    durationMillis = 0;
    emit();
    return;
  }
  await loadIndex(startAt, true);
}

export async function playTrack(track: MusicTrack, more?: MusicTrack[]) {
  const list = more?.length ? more : [track];
  const idx = list.findIndex((t) => t.id === track.id);
  await setQueue(list, idx >= 0 ? idx : 0);
}

export async function togglePlayPause() {
  if (adBreakActive) return;
  if (!sound) return;
  if (isPlaying) await sound.pauseAsync();
  else await sound.playAsync();
}

export async function play() {
  if (adBreakActive) return;
  if (!sound && queue.length) await loadIndex(index, true);
  else if (sound) await sound.playAsync();
}

export async function pause() {
  if (sound) await sound.pauseAsync();
}

async function nextInternal(autoplay = true) {
  if (adBreakActive) return;
  if (!queue.length) return;
  let nextIndex = index + 1;
  if (nextIndex >= queue.length) {
    if (repeat === "all") nextIndex = 0;
    else {
      await pause();
      return;
    }
  }
  if (shuffle && queue.length > 1) {
    let r = index;
    while (r === index) r = Math.floor(Math.random() * queue.length);
    nextIndex = r;
  }
  await loadIndex(nextIndex, autoplay);
}

export async function next() {
  await nextInternal(true);
}

export async function previous() {
  if (adBreakActive) return;
  if (positionMillis > 3000 && sound) {
    await sound.setPositionAsync(0);
    return;
  }
  if (!queue.length) return;
  let prev = index - 1;
  if (prev < 0) prev = repeat === "all" ? queue.length - 1 : 0;
  await loadIndex(prev, true);
}

export async function seek(ms: number) {
  if (adBreakActive) return;
  if (sound) await sound.setPositionAsync(Math.max(0, ms));
}

export function setShuffle(on: boolean) {
  shuffle = on;
  emit();
}

export function setRepeat(mode: PlayerState["repeat"]) {
  repeat = mode;
  emit();
}

export async function stopPlayer() {
  await unload();
  queue = [];
  index = 0;
  isPlaying = false;
  positionMillis = 0;
  durationMillis = 0;
  emit();
}