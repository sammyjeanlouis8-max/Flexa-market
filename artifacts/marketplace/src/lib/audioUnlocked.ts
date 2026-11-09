/**
 * Session audio unlock + explicit user mute preference for promo / boost videos.
 *
 * - unlocked: browser/native allows unmuted playback (gesture or native WebView)
 * - userMuted: viewer explicitly muted — honor across video switches
 */

let _unlocked: boolean;
try {
  _unlocked = sessionStorage.getItem("flexaAudioUnlocked") === "1";
} catch {
  _unlocked = false;
}

let _userMuted: boolean;
try {
  _userMuted = sessionStorage.getItem("flexaUserMuted") === "1";
} catch {
  _userMuted = false;
}

export function isAudioUnlocked(): boolean {
  return _unlocked;
}

function dispatchBrowserEvent(name: string, detail: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function setAudioUnlocked(val: boolean): void {
  _unlocked = val;
  try {
    if (val) sessionStorage.setItem("flexaAudioUnlocked", "1");
    else sessionStorage.removeItem("flexaAudioUnlocked");
  } catch { /* ignore */ }
  dispatchBrowserEvent("flexa:audio-unlocked", val);
}

/** True when the viewer explicitly chose mute (not just browser autoplay block). */
export function isUserMutedPreference(): boolean {
  return _userMuted;
}

export function setUserMutedPreference(val: boolean): void {
  _userMuted = val;
  try {
    if (val) sessionStorage.setItem("flexaUserMuted", "1");
    else sessionStorage.removeItem("flexaUserMuted");
  } catch { /* ignore */ }
  dispatchBrowserEvent("flexa:user-muted", val);
}

/**
 * Desired start state for a newly active video card.
 * - User muted → stay muted
 * - Otherwise → prefer sound (caller falls back if the platform blocks unmuted autoplay)
 * Native / prior unlock are soft signals; callers still attempt unmuted play first.
 */
export function preferUnmutedAutoplay(_isNative: boolean): boolean {
  if (_userMuted) return false;
  // Prefer unmuted whenever the user has not muted. Callers attempt unmuted
  // play first and fall back cleanly when the browser rejects autoplay-with-sound.
  return true;
}
