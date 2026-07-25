let _unlocked: boolean;
try {
  _unlocked = sessionStorage.getItem("flexaAudioUnlocked") === "1";
} catch {
  _unlocked = false;
}

export function isAudioUnlocked(): boolean {
  return _unlocked;
}

export function setAudioUnlocked(val: boolean): void {
  _unlocked = val;
  try {
    if (val) sessionStorage.setItem("flexaAudioUnlocked", "1");
    else sessionStorage.removeItem("flexaAudioUnlocked");
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("flexa:audio-unlocked", { detail: val }));
}
