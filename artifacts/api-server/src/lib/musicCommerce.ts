/**
 * Server-side Flexa Music commerce kill-switch.
 * Keep in sync with marketplace `src/lib/musicCommerce.ts`.
 *
 * When disabled, upload/listen paywalls are not enforced. Historical
 * subscription and purchase records remain in the database.
 */
export const MUSIC_COMMERCE_ENABLED = false;

export function musicUploadsAreFree(): boolean {
  return !MUSIC_COMMERCE_ENABLED;
}

export function musicListeningIsFree(): boolean {
  return !MUSIC_COMMERCE_ENABLED;
}
