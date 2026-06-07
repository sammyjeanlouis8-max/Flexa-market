// Per-profile audio-unlock state. Once a user has tapped the unmute toggle
// (or the browser has allowed an unmuted autoplay), we remember that consent
// indefinitely so every subsequent boosted video on every subsequent visit
// starts with sound on. Was previously sessionStorage, which forced the user
// to re-grant audio consent on every new tab / cold app open.
//
// localStorage is shared across tabs of the same origin; we still dispatch
// `flexa:audio-unlocked` so video cards inside the same document stay in
// sync without an explicit storage event.
const STORAGE_KEY = "flexaAudioUnlocked";

let _unlocked: boolean;
try {
  // Migrate any legacy sessionStorage flag from previous releases.
  const legacy = sessionStorage.getItem(STORAGE_KEY);
  if (legacy === "1") {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* localStorage unavailable (Safari private mode) — keep session state */
    }
  }
  _unlocked = localStorage.getItem(STORAGE_KEY) === "1";
} catch {
  // Both storages unavailable (server-side render, very old browser).
  _unlocked = false;
}

export function isAudioUnlocked(): boolean {
  return _unlocked;
}

export function setAudioUnlocked(val: boolean): void {
  if (_unlocked === val) return;
  _unlocked = val;
  try {
    if (val) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage quota or private mode — in-memory flag still applies */
  }
  try {
    window.dispatchEvent(new CustomEvent("flexa:audio-unlocked", { detail: val }));
  } catch {
    /* SSR or sandboxed iframe */
  }
}
