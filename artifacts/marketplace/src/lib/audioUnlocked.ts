/**
 * Session audio preference for promotional video playback.
 *
 * - "auto": try unmuted first; fall back to muted + CTA if the browser blocks it
 * - "on":   user wants sound — always attempt unmuted (still fall back if blocked)
 * - "off":  user explicitly muted — stay muted across swipes until they unmute
 */

export type AudioPref = "auto" | "on" | "off";

const PREF_KEY = "flexaAudioPref";
const LEGACY_KEY = "flexaAudioUnlocked";

let _pref: AudioPref;
try {
  const stored = sessionStorage.getItem(PREF_KEY);
  if (stored === "on" || stored === "off" || stored === "auto") {
    _pref = stored;
  } else if (sessionStorage.getItem(LEGACY_KEY) === "1") {
    _pref = "on";
  } else {
    _pref = "auto";
  }
} catch {
  _pref = "auto";
}

function persist(pref: AudioPref): void {
  _pref = pref;
  try {
    sessionStorage.setItem(PREF_KEY, pref);
    if (pref === "on") sessionStorage.setItem(LEGACY_KEY, "1");
    else sessionStorage.removeItem(LEGACY_KEY);
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("flexa:audio-unlocked", { detail: pref !== "off" }));
}

/** True when the session should attempt unmuted playback. */
export function isAudioUnlocked(): boolean {
  return _pref !== "off";
}

export function getAudioPref(): AudioPref {
  return _pref;
}

/** Prefer sound unless the user explicitly muted this session. */
export function prefersSound(): boolean {
  return _pref !== "off";
}

export function setAudioUnlocked(val: boolean): void {
  persist(val ? "on" : "off");
}

export function setAudioPref(pref: AudioPref): void {
  persist(pref);
}
