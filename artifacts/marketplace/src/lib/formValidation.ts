/** Scroll an invalid field into view below sticky headers and focus when possible. */

const DEFAULT_HEADER_OFFSET_PX = 96;

export function scrollToInvalidField(
  target: HTMLElement | null | undefined,
  options?: { headerOffsetPx?: number; focus?: boolean },
): void {
  if (!target || typeof window === "undefined") return;
  const headerOffset = options?.headerOffsetPx ?? DEFAULT_HEADER_OFFSET_PX;
  const rect = target.getBoundingClientRect();
  const absoluteTop = rect.top + window.scrollY;
  const nextTop = Math.max(0, absoluteTop - headerOffset);
  window.scrollTo({ top: nextTop, behavior: "smooth" });

  if (options?.focus !== false) {
    const focusable = target.matches("input, textarea, select, button, [tabindex]")
      ? target
      : target.querySelector<HTMLElement>("input, textarea, select, button, [tabindex]");
    if (focusable && typeof focusable.focus === "function") {
      try {
        focusable.focus({ preventScroll: true });
      } catch {
        focusable.focus();
      }
    }
  }
}

/** First invalid key in declaration order that has a message. */
export function firstErrorKey(
  errors: Record<string, string | null | undefined>,
  order: string[],
): string | null {
  for (const key of order) {
    if (errors[key]) return key;
  }
  return null;
}
