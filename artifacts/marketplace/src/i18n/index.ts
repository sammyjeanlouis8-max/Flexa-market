import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en";

// ── Async locale loaders ───────────────────────────────────────────────────────
// EN is bundled synchronously (immediate fallback + zero-latency initial render).
// All other locales are separate Vite chunks loaded on demand.
const ASYNC_LOADERS: Record<string, () => Promise<{ default: object }>> = {
  fr: () => import("./locales/fr"),
  ht: () => import("./locales/ht"),
  es: () => import("./locales/es"),
  pt: () => import("./locales/pt"),
  de: () => import("./locales/de"),
  hi: () => import("./locales/hi"),
  fil: () => import("./locales/fil"),
  ha: () => import("./locales/ha"),
  zu: () => import("./locales/zu"),
  af: () => import("./locales/af"),
  it: () => import("./locales/it"),
  nl: () => import("./locales/nl"),
  sv: () => import("./locales/sv"),
  no: () => import("./locales/no"),
  ar: () => import("./locales/ar"),
  ja: () => import("./locales/ja"),
  ko: () => import("./locales/ko"),
  sw: () => import("./locales/sw"),
};

// ── Supported languages ────────────────────────────────────────────────────────

/** All languages supported across the entire app */
export const SUPPORTED_LANGUAGES = [
  { code: "en", flag: "🇺🇸", name: "English" },
  { code: "fr", flag: "🇫🇷", name: "Français" },
  { code: "ht", flag: "🇭🇹", name: "Kreyòl Ayisyen" },
  { code: "es", flag: "🇪🇸", name: "Español" },
  { code: "pt", flag: "🇧🇷", name: "Português" },
  { code: "de", flag: "🇩🇪", name: "Deutsch" },
  { code: "hi", flag: "🇮🇳", name: "हिन्दी" },
  { code: "fil", flag: "🇵🇭", name: "Filipino" },
  { code: "ha", flag: "🇳🇬", name: "Hausa" },
  { code: "zu", flag: "🇿🇦", name: "isiZulu" },
  { code: "af", flag: "🇿🇦", name: "Afrikaans" },
  { code: "it", flag: "🇮🇹", name: "Italiano" },
  { code: "nl", flag: "🇳🇱", name: "Nederlands" },
  { code: "sv", flag: "🇸🇪", name: "Svenska" },
  { code: "no", flag: "🇳🇴", name: "Norsk" },
  { code: "ar", flag: "🇸🇦", name: "العربية" },
  { code: "ja", flag: "🇯🇵", name: "日本語" },
  { code: "ko", flag: "🇰🇷", name: "한국어" },
  { code: "sw", flag: "🇰🇪", name: "Kiswahili" },
] as const;

/**
 * Languages shown on public/auth pages.
 * Spec §8: country ≠ language — ALL languages are available from the start,
 * including Haitian Creole.  A user in the USA can use Creole; a user in
 * Haiti can use English.
 */
export const PUBLIC_LANGUAGES = SUPPORTED_LANGUAGES;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]["code"];
export type PublicLanguage = SupportedLanguage;

// ── Storage keys ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "flexamarket_lang";
const EXPLICIT_KEY = "flexamarket_lang_explicit";

// ── Initial language resolution ───────────────────────────────────────────────
// Spec §1: Single source of truth is user.language (signup or settings).
// Spec §5: Fallback ONLY to English — never guess or randomise.
//
// Resolution order (STRICT — no browser-language guessing):
//   1. Explicit user choice stored in localStorage (from settings or signup)
//   2. English (hard default — never auto-detect from navigator.language)
//
// The user's server-side preferredLanguage is applied reactively by auth.tsx
// once the /auth/me response arrives, without requiring a page reload.

function resolveInitialLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "en";

  // ── Legacy key migration (one-time) ─────────────────────────────────────
  const legacyLang = localStorage.getItem("bazarhub_lang");
  if (legacyLang) {
    const isAllowed = SUPPORTED_LANGUAGES.some(l => l.code === legacyLang);
    if (isAllowed) {
      localStorage.setItem(STORAGE_KEY, legacyLang);
      localStorage.setItem(EXPLICIT_KEY, "1");
    }
    localStorage.removeItem("bazarhub_lang");
  }
  const legacyGps = localStorage.getItem("bazarhub_gps_dismissed");
  if (legacyGps && !localStorage.getItem("flexamarket_gps_dismissed")) {
    localStorage.setItem("flexamarket_gps_dismissed", legacyGps);
    localStorage.removeItem("bazarhub_gps_dismissed");
  }

  // ── Explicit user choice ──────────────────────────────────────────────────
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED_LANGUAGES.some(l => l.code === stored)) {
    return stored as SupportedLanguage;
  }

  // ── Hard default: English ─────────────────────────────────────────────────
  // Spec §5: "Fallback ONLY to English" — no browser-language guessing.
  return "en";
}

const initialLng = resolveInitialLanguage();

// ── i18next initialization ────────────────────────────────────────────────────
// Synchronous init with EN already bundled — first render is never blocked.
// `partialBundledLanguages` lets us add other locales at runtime.
i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en } },
    lng: initialLng,
    fallbackLng: "en",
    supportedLngs: ["en", "fr", "ht", "es", "pt", "de", "hi", "fil", "ha", "zu", "af", "it", "nl", "sv", "no", "ar", "ja", "ko", "sw"],
    partialBundledLanguages: true,
    interpolation: { escapeValue: false },
    // Spec §5: Log every missing key as an error so they can be fixed.
    // Silent ignoring of missing translations is NOT allowed.
    saveMissing: true,
    missingKeyHandler: (_lngs, _ns, key) => {
      console.error(
        `[i18n] MISSING TRANSLATION KEY: "${key}" — must be added to all locale files.`
      );
    },
  });

// ── Async-load the initial non-English locale ─────────────────────────────────
// If the stored language is not English, fetch its bundle in the background
// and switch reactively (no reload).  The user briefly sees EN strings as the
// graceful fallback while the bundle arrives.
if (initialLng !== "en" && ASYNC_LOADERS[initialLng]) {
  preloadLanguage(initialLng)
    .then(() => i18n.changeLanguage(initialLng))
    .catch(() => { /* leave on EN if the chunk fails to load */ });
}

// ── preloadLanguage ───────────────────────────────────────────────────────────
/** Ensure a locale bundle is loaded into i18next (idempotent). */
export async function preloadLanguage(lang: SupportedLanguage): Promise<void> {
  if (lang === "en" || i18n.hasResourceBundle(lang, "translation")) return;
  const loader = ASYNC_LOADERS[lang];
  if (!loader) return;
  try {
    const mod = await loader();
    i18n.addResourceBundle(lang, "translation", mod.default ?? mod);
  } catch {
    console.error(`[i18n] Failed to load bundle for language: "${lang}"`);
  }
}

// ── setLanguage ───────────────────────────────────────────────────────────────
/**
 * Switch the active language INSTANTLY without a page reload.
 *
 * Spec §7: "Change must apply instantly (no reload required)."
 *
 * react-i18next's useTranslation() hook is reactive — calling
 * i18n.changeLanguage() causes every component to re-render with the new
 * strings immediately.  The bundle is pre-loaded before switching so there
 * is no flash of untranslated content.
 */
export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  await preloadLanguage(lang);
  localStorage.setItem(STORAGE_KEY, lang);
  localStorage.setItem(EXPLICIT_KEY, "1");
  await i18n.changeLanguage(lang);
}

// ── getCurrentLanguage ────────────────────────────────────────────────────────
export function getCurrentLanguage(): SupportedLanguage {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED_LANGUAGES.some(l => l.code === stored)) {
    return stored as SupportedLanguage;
  }
  return "en";
}

/** @deprecated Use browser navigator.language detection is intentionally removed.
 * Spec §5: DO NOT guess language — fallback ONLY to English. */
export function detectBrowserLanguage(): SupportedLanguage {
  return "en";
}

export default i18n;
