/**
 * Layout metrics measured from live flexamarket.com WebView at 390×844 CSS px
 * (iPhone-like). Native layouts scale from these proportions.
 *
 * HOME (Featured / Today's Picks grid):
 * - page horizontal inset ≈ 12–13
 * - column gap ≈ 12 (Tailwind gap-2.5 / gap-3)
 * - listing-card-media: aspect-square 1:1, object-fit: cover
 * - media size @390: 168.5×168.5; card width ≈ 170.5
 * - bottom tab bar ≈ 57
 *
 * PDP gallery:
 * - thumb: 44×44, left inset 8, vertical gap 6
 * - gap thumb → main: 10
 * - main: aspect-square, flex-1, max-height min(52vh, 380), object-fit: contain
 * - main @390: 305×305 (≈78% of viewport width)
 * - purchase bar: height ≈ 61, padding 8×10, CTA buttons height 44
 * - Add to Cart button width ≈ 125; Buy Now ≈ 135
 */
export const WEB_VIEWPORT = { width: 390, height: 844 } as const;

export const HOME_METRICS = {
  pageInset: 12,
  columnGap: 12,
  imageAspect: 1, // square
  objectFit: "cover" as const,
  /** Measured media edge at 390 CSS px */
  mediaAt390: 168.5,
  bottomBar: 57,
};

export const PDP_METRICS = {
  thumbSize: 44,
  thumbGap: 6,
  thumbLeft: 8,
  gapThumbToMain: 10,
  mainAspect: 1,
  mainMaxVh: 0.52,
  mainMaxPx: 380,
  objectFit: "contain" as const,
  purchaseBarPaddingV: 8,
  purchaseBarPaddingH: 10,
  purchaseBtnHeight: 44,
  purchaseBarApprox: 61,
};

/** Home card width for a given window width (2-col grid). */
export function homeCardWidth(windowWidth: number): number {
  const { pageInset, columnGap } = HOME_METRICS;
  return (windowWidth - pageInset * 2 - columnGap) / 2;
}

/** PDP main gallery box size for a given window. */
export function pdpMainSize(windowWidth: number, windowHeight: number): number {
  const {
    thumbSize,
    thumbLeft,
    gapThumbToMain,
    mainMaxVh,
    mainMaxPx,
    purchaseBarApprox,
  } = PDP_METRICS;
  const rightInset = 12;
  const fromWidth =
    windowWidth - thumbLeft - thumbSize - gapThumbToMain - rightInset;
  // Reserve header + title/price block + purchase bar so price isn't covered.
  const reservedChrome = 72 + 150 + purchaseBarApprox;
  const fromHeight = Math.min(
    windowHeight * mainMaxVh,
    mainMaxPx,
    Math.max(160, windowHeight - reservedChrome),
  );
  return Math.max(160, Math.min(fromWidth, fromHeight));
}
