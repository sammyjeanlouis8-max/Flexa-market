type CopyTree = { readonly [key: string]: unknown };

/** Recovery messages stay English even when the rest of the UI is translated. */
export function withEnglishRetryCopy(locale: CopyTree, english: CopyTree): CopyTree {
  const result: Record<string, unknown> = { ...locale };
  for (const [key, value] of Object.entries(english)) {
    if (typeof value === "string") {
      if (/retry|tryAgain|try_again/i.test(key) || /\btry\b[^.!?\n]*\bagain\b|\bretry\b/i.test(value)) {
        result[key] = value;
      }
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const translated = locale[key];
      result[key] = withEnglishRetryCopy(
        typeof translated === "object" && translated !== null && !Array.isArray(translated) ? translated as CopyTree : {},
        value as CopyTree,
      );
    }
  }
  return result;
}