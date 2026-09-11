import { describe, expect, it } from "vitest";
import { withEnglishRetryCopy } from "../../../marketplace/src/i18n/englishRetryCopy";
import en from "../../../marketplace/src/i18n/locales/en";
import ht from "../../../marketplace/src/i18n/locales/ht";
import fr from "../../../marketplace/src/i18n/locales/fr";

describe("English recovery copy across app languages", () => {
  it.each([ht, fr])("keeps retry prompts English without changing ordinary labels", (locale) => {
    const result = withEnglishRetryCopy(locale, en) as typeof en;
    expect(result.messages.voiceRetry).toBe(en.messages.voiceRetry);
    expect(result.messages.voiceUploadFailed).toBe(en.messages.voiceUploadFailed);
    expect(result.messages.connectionProblem).toBe(en.messages.connectionProblem);
    expect(result.nav.home).toBe(locale.nav.home);
  });
  it("supports asynchronously loaded and incomplete locales", () => {
    const locale = { page: { title: "Bonjour", retry: "Réessayer" } };
    const english = { page: { title: "Hello", retry: "Try again", failed: "Upload failed. Try again." } };
    expect(withEnglishRetryCopy(locale, english)).toEqual({
      page: { title: "Bonjour", retry: "Try again", failed: "Upload failed. Try again." },
    });
    expect(locale.page.retry).toBe("Réessayer");
  });
  it("preserves array-valued translations", () => {
    const localized = { steps: ["Profil", "Documents"], retry: "Réessayer" };
    expect(withEnglishRetryCopy(localized, { steps: ["Profile", "Documents"], retry: "Try again" }))
      .toEqual({ steps: ["Profil", "Documents"], retry: "Try again" });
  });
});