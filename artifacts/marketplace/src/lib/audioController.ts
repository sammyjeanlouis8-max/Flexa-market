/**
 * Global audio controller — ensures only ONE audio message plays at a time.
 * Module-level singleton so it works across all AudioPlayer instances
 * without needing React context or prop drilling.
 */

let currentAudio: HTMLAudioElement | null = null;
const listeners: Set<() => void> = new Set();

/** Call this before playing an audio element.
 *  Any other currently-playing audio is paused and reset. */
export function requestPlay(audio: HTMLAudioElement): void {
  if (currentAudio && currentAudio !== audio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    notifyListeners();
  }
  currentAudio = audio;
}

/** Call this when an audio element is paused or ends. */
export function releaseAudio(audio: HTMLAudioElement): void {
  if (currentAudio === audio) {
    currentAudio = null;
    notifyListeners();
  }
}

/** Returns true if the given audio element is the currently registered one. */
export function isCurrentAudio(audio: HTMLAudioElement): boolean {
  return currentAudio === audio;
}

/** Subscribe to controller state changes (so other players can sync their UI). */
export function subscribeAudioController(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notifyListeners() {
  listeners.forEach(cb => cb());
}
