import { setLanguage, type SupportedLanguage } from "@/i18n";

/** Languages the auth API accepts for `preferredLanguage`. */
export const PERSISTABLE_LANGUAGES = [
  "en", "fr", "ht", "es", "pt", "de", "hi", "fil", "ha", "zu",
  "af", "it", "nl", "sv", "no", "ar", "ja", "ko", "sw",
] as const;

export type PersistableLanguage = (typeof PERSISTABLE_LANGUAGES)[number];

export function isPersistableLanguage(code: string): code is PersistableLanguage {
  return (PERSISTABLE_LANGUAGES as readonly string[]).includes(code);
}

/**
 * Apply a UI language instantly and, when authenticated, persist it on the
 * user profile so login / WebView remounts do not overwrite the choice.
 */
export async function persistLanguage(
  code: SupportedLanguage,
  token: string | null | undefined,
): Promise<void> {
  await setLanguage(code);
  if (!token || !isPersistableLanguage(code)) return;
  try {
    await fetch("/api/auth/language", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ language: code }),
    });
  } catch {
    /* local switch already applied — server sync is best-effort */
  }
}
