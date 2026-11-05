/**
 * Flexa Music commerce kill-switch.
 *
 * When disabled (current production default), listening, uploading, playlists,
 * likes, follows, and downloads are free for every signed-in user.
 * Historical subscription / purchase rows are preserved so commerce can be
 * re-enabled later without a data migration.
 */
export const MUSIC_COMMERCE_ENABLED = false;

/** Free full-length listens before a sale-track paywall (ignored when commerce off). */
export const MUSIC_FREE_PLAYS_BEFORE_PAYWALL = 2;

export function musicListeningIsFree(): boolean {
  return !MUSIC_COMMERCE_ENABLED;
}

export function musicUploadsAreFree(): boolean {
  return !MUSIC_COMMERCE_ENABLED;
}

export function musicPurchasesRequired(): boolean {
  return MUSIC_COMMERCE_ENABLED;
}
