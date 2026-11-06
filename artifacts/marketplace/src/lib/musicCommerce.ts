/**
 * Flexa Music commerce kill-switch.
 *
 * When disabled (current production default), listening, uploading, playlists,
 * likes, follows, and downloads are free for every signed-in user.
 * Historical subscription / purchase rows are preserved so commerce can be
 * re-enabled later without a data migration.
 *
 * Optional Vite override: VITE_MUSIC_COMMERCE_ENABLED=true|1|yes
 */
function readCommerceEnvFlag(): boolean {
  try {
    const raw = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
      ?.VITE_MUSIC_COMMERCE_ENABLED;
    if (raw == null || raw === "") return false;
    const v = String(raw).trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
  } catch {
    return false;
  }
}

export const MUSIC_COMMERCE_ENABLED = readCommerceEnvFlag();

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
