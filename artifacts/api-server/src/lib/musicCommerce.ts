/**
 * Server-side Flexa Music commerce kill-switch.
 * Keep in sync with marketplace `src/lib/musicCommerce.ts`.
 *
 * When disabled, upload/listen paywalls are not enforced. Historical
 * subscription and purchase records remain in the database.
 *
 * Enable with MUSIC_COMMERCE_ENABLED=true or MUSIC_COMMERCE_ENABLED=1.
 */

/** Parse env flag: only explicit "true" / "1" enable commerce. */
export function parseMusicCommerceEnabled(
  value: string | undefined = process.env.MUSIC_COMMERCE_ENABLED,
): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

export const MUSIC_COMMERCE_ENABLED = parseMusicCommerceEnabled();

export function musicUploadsAreFree(): boolean {
  return !MUSIC_COMMERCE_ENABLED;
}

export function musicListeningIsFree(): boolean {
  return !MUSIC_COMMERCE_ENABLED;
}
