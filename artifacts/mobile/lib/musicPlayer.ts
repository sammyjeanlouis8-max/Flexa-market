/**
 * Lightweight Expo AV queue player for Flexa Music.
 */
import { Audio, AVPlaybackStatus, AVPlaybackStatusSuccess } from "expo-av";
import {
  absoluteMusicUrl,
  fetchMusicStreamUrl,
  type MusicTrack,
} from "./musicApi";

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
};

type Listener = (state: PlayerState) => void;

let sound: Audio.Sound | null = null;
let queue: MusicTrack[] = [];
let index = 0;
let shuffle = false;
let repeat: PlayerState["repeat"] = "off";
let isPlaying = false;
let positionMillis = 0;
let durationMillis = 0;
let loading = false;
const listeners = new Set<Listener>();
let audioModeReady = false;

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
  };
}

function emit() {
  const s = snapshot();
  for (const l of listeners) l(s);
}

export function subscribeMusicPlayer(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function getPlayerState(): PlayerState {
  return snapshot();
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

function onStatusUpdate(status: AVPlaybackStatus) {
  if (!status.isLoaded) return;
  const st = status as AVPlaybackStatusSuccess;
  positionMillis = st.positionMillis ?? 0;
  durationMillis = st.durationMillis ?? 0;
  isPlaying = st.isPlaying;
  emit();
  if (st.didJustFinish && !st.isLooping) {
    void next();
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
  if (!sound) return;
  if (isPlaying) await sound.pauseAsync();
  else await sound.playAsync();
}

export async function play() {
  if (!sound && queue.length) await loadIndex(index, true);
  else if (sound) await sound.playAsync();
}

export async function pause() {
  if (sound) await sound.pauseAsync();
}

export async function next() {
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
  await loadIndex(nextIndex, true);
}

export async function previous() {
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