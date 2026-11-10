/**
 * Exclusive promotional-video playback controller.
 *
 * Guarantees at most one <video> produces audio/visual playback in the
 * Promotional Videos feed. Stale async play() / stall-recovery / touch
 * handlers MUST go through playIfOwner so a deactivated card cannot resume
 * after the user has scrolled to another advertisement.
 */

export type PromoPlayerOwner = {
  listingId: number;
  generation: number;
  element: HTMLVideoElement;
};

let owner: PromoPlayerOwner | null = null;
const registered = new Map<HTMLVideoElement, number>();

/** Pause and mute a video element without touching React mute preference. */
export function silencePromoVideo(el: HTMLVideoElement | null | undefined): void {
  if (!el) return;
  try {
    el.pause();
  } catch {
    /* ignore */
  }
  try {
    // Hard-stop audio output even if pause() is still settling asynchronously.
    el.muted = true;
  } catch {
    /* ignore */
  }
}

function silenceOthers(except: HTMLVideoElement | null): void {
  for (const el of registered.keys()) {
    if (el === except) continue;
    silencePromoVideo(el);
  }
  if (except && owner && owner.element !== except) {
    silencePromoVideo(owner.element);
  }
}

/** Register a mounted feed <video> so exclusive pause can find it. */
export function registerPromoVideo(listingId: number, el: HTMLVideoElement): void {
  registered.set(el, listingId);
}

/** Unregister on unmount; silence if it still owned playback. */
export function unregisterPromoVideo(listingId: number, el: HTMLVideoElement): void {
  if (registered.get(el) === listingId) {
    registered.delete(el);
  }
  if (owner && owner.element === el && owner.listingId === listingId) {
    silencePromoVideo(el);
    owner = null;
  }
}

/**
 * Claim exclusive playback for this listing + activation generation.
 * Immediately silences every other registered promo video.
 */
export function claimPromoPlayback(
  listingId: number,
  el: HTMLVideoElement,
  generation: number,
): boolean {
  if (!el || generation <= 0) return false;
  registered.set(el, listingId);
  silenceOthers(el);
  owner = { listingId, generation, element: el };
  return true;
}

/** True when this listing/generation still owns the exclusive slot. */
export function isPromoPlaybackOwner(listingId: number, generation: number): boolean {
  return !!owner
    && owner.listingId === listingId
    && owner.generation === generation;
}

/**
 * play() only if ownership is still valid. Returns null when skipped so
 * callers never attach .then/.catch that can revive a stale card.
 */
export function playPromoIfOwner(
  listingId: number,
  el: HTMLVideoElement,
  generation: number,
): Promise<void> | null {
  if (!isPromoPlaybackOwner(listingId, generation)) return null;
  if (owner?.element !== el) return null;
  try {
    const result = el.play();
    if (result && typeof (result as Promise<void>).then === "function") {
      return (result as Promise<void>).catch((err) => {
        // Swallow AbortError from intentional pause during scroll; rethrow others
        // only after confirming we still own playback (caller may .catch).
        if (!isPromoPlaybackOwner(listingId, generation)) return;
        throw err;
      });
    }
    return Promise.resolve();
  } catch {
    return null;
  }
}

/** Release ownership for this listing (optionally generation-scoped) and silence. */
export function releasePromoPlayback(
  listingId: number,
  el?: HTMLVideoElement | null,
  generation?: number,
): void {
  if (
    owner
    && owner.listingId === listingId
    && (generation === undefined || owner.generation === generation)
  ) {
    silencePromoVideo(el ?? owner.element);
    owner = null;
    return;
  }
  if (el) silencePromoVideo(el);
}

/** Pause + mute every registered promo video (feed exit / app background). */
export function silenceAllPromoVideos(): void {
  for (const el of registered.keys()) {
    silencePromoVideo(el);
  }
  if (owner) {
    silencePromoVideo(owner.element);
    owner = null;
  }
}

/** Test / diagnostics helper. */
export function getPromoPlaybackOwner(): PromoPlayerOwner | null {
  return owner;
}

/** Test helper — clear singleton state between cases. */
export function resetPromoVideoPlayerControllerForTests(): void {
  owner = null;
  registered.clear();
}
