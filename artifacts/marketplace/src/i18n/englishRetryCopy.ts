type CopyTree = { [key: string]: string | CopyTree };

/** Recovery messages stay English even when the rest of the UI is translated. */
export function withEnglishRetryCopy(locale: CopyTree, english: CopyTree): CopyTree {
  const result: CopyTree = { ...locale };
  for (const [key, value] of Object.entries(english)) {
    if (typeof value === "string") {
      if (/retry|tryAgain|try_again/i.test(key) || /\btry\b[^.!?\n]*\bagain\b|\bretry\b/i.test(value)) {
        result[key] = value;
      }
    } else {
      const translated = locale[key];
      result[key] = withEnglishRetryCopy(
        typeof translated === "object" && translated !== null ? translated : {},
        value,
      );
    }
  }
  return result;
}